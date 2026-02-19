import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ApiError, sendApiError } from "../utils/errors.js";

interface AuthTokenPayload {
  agentId: string;
  ownerAddress: string;
  scopes?: string[];
  iat?: number;
  exp?: number;
}

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      sendApiError(res, new ApiError("UNAUTHORIZED", 401, "Missing bearer token"), req.requestId);
      return;
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, jwtSecret);
      const payload = parseAuthPayload(decoded);
      req.auth = payload;
      next();
    } catch {
      sendApiError(res, new ApiError("UNAUTHORIZED", 401, "Invalid bearer token"), req.requestId);
    }
  };
}

function parseAuthPayload(decoded: string | jwt.JwtPayload): { agentId: string; ownerAddress: string; scopes: string[] } {
  if (typeof decoded === "string") {
    throw new ApiError("UNAUTHORIZED", 401, "JWT payload is malformed");
  }

  const payload = decoded as AuthTokenPayload;
  if (typeof payload.agentId !== "string" || typeof payload.ownerAddress !== "string") {
    throw new ApiError("UNAUTHORIZED", 401, "JWT missing required claims");
  }

  return {
    agentId: payload.agentId,
    ownerAddress: payload.ownerAddress,
    scopes: Array.isArray(payload.scopes) ? payload.scopes.filter((scope) => typeof scope === "string") : []
  };
}
