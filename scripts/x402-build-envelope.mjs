#!/usr/bin/env node

import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: node scripts/x402-build-envelope.mjs --challenge-file <path> (--x-payment <token> | --x-payment-file <path>)");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      out[key.slice(2)] = "";
      continue;
    }
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function asRecord(value) {
  return value && typeof value === "object" ? value : undefined;
}

function readString(record, key) {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

function decodeBase64(raw) {
  try {
    return Buffer.from(raw, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function decodeBase64Url(raw) {
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return undefined;
  }
}

function parseXPayment(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const direct = parseJson(trimmed);
  if (direct) return direct;

  const fromBase64 = decodeBase64(trimmed);
  if (fromBase64) {
    const parsed = parseJson(fromBase64);
    if (parsed) return parsed;
  }

  const fromBase64Url = decodeBase64Url(trimmed);
  if (fromBase64Url) {
    const parsed = parseJson(fromBase64Url);
    if (parsed) return parsed;
  }

  return undefined;
}

function normalizePayload(payload) {
  const out = { ...payload };
  const nested = asRecord(out.payload);
  if (out.authorization === undefined && nested?.authorization !== undefined) {
    out.authorization = nested.authorization;
  }
  if (out.signature === undefined && nested?.signature !== undefined) {
    out.signature = nested.signature;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const challengeFile = args["challenge-file"];
  const xPayment = args["x-payment"];
  const xPaymentFile = args["x-payment-file"];

  if (!challengeFile || (!xPayment && !xPaymentFile)) {
    usage();
    process.exit(1);
  }

  const challengeRaw = readFileSync(challengeFile, "utf-8");
  const challenge = parseJson(challengeRaw);
  if (!challenge) {
    throw new Error("Failed to parse challenge JSON");
  }

  const xPaymentRaw = xPayment ?? readFileSync(xPaymentFile, "utf-8");
  const parsed = parseXPayment(xPaymentRaw);
  if (!parsed) {
    throw new Error("Failed to parse x-payment (expected JSON/base64/base64url JSON)");
  }

  const isEnvelope = parsed.paymentPayload !== undefined || parsed.paymentRequirements !== undefined;
  const payloadSource = isEnvelope ? asRecord(parsed.paymentPayload) ?? {} : parsed;
  const requirementsSource = isEnvelope ? asRecord(parsed.paymentRequirements) ?? {} : {};

  const paymentPayload = normalizePayload(payloadSource);
  const scheme = readString(challenge, "scheme") ?? readString(asRecord(challenge.accepts?.[0]), "scheme") ?? "gokite-aa";
  const network = readString(challenge, "network") ?? readString(asRecord(challenge.accepts?.[0]), "network") ?? "kite-testnet";
  const x402Version = typeof challenge.x402Version === "number" ? challenge.x402Version : 1;

  if (!readString(paymentPayload, "scheme")) paymentPayload.scheme = scheme;
  if (!readString(paymentPayload, "network")) paymentPayload.network = network;
  if (typeof paymentPayload.x402Version !== "number") paymentPayload.x402Version = x402Version;

  const paymentRequirements = {
    ...requirementsSource,
    x402Version,
    scheme,
    network,
    asset: readString(challenge, "asset") ?? readString(asRecord(challenge.accepts?.[0]), "asset"),
    payTo: readString(challenge, "payTo") ?? readString(asRecord(challenge.accepts?.[0]), "payTo"),
    maxAmountRequired:
      readString(challenge, "maxAmountRequired") ??
      readString(asRecord(challenge.accepts?.[0]), "maxAmountRequired"),
    paymentRequestId:
      readString(challenge, "paymentRequestId") ?? readString(requirementsSource, "paymentRequestId"),
    accepts: Array.isArray(challenge.accepts) ? challenge.accepts : requirementsSource.accepts
  };

  process.stdout.write(
    `${JSON.stringify({ paymentPayload, paymentRequirements }, null, 2)}\n`
  );
}

main();
