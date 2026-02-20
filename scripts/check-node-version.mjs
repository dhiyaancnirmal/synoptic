#!/usr/bin/env node

const REQUIRED_NODE = "22.21.1";
const REQUIRED_PNPM = "9.15.4";

function parse(version) {
  return version.split(".").map((value) => Number(value));
}

function atLeast(current, minimum) {
  const [cMajor, cMinor, cPatch] = parse(current);
  const [mMajor, mMinor, mPatch] = parse(minimum);

  if (cMajor !== mMajor) return cMajor > mMajor;
  if (cMinor !== mMinor) return cMinor > mMinor;
  return cPatch >= mPatch;
}

const currentNode = process.versions.node;
const [nodeMajor] = parse(currentNode);
const validMajor = nodeMajor === 22;
const validMinimum = atLeast(currentNode, REQUIRED_NODE);

if (!validMajor || !validMinimum) {
  console.error("");
  console.error(`Unsupported Node.js version: ${currentNode}`);
  console.error(`Required: >= ${REQUIRED_NODE} < 23.0.0`);
  console.error("");
  console.error("Fix options:");
  console.error(`- nvm: nvm install ${REQUIRED_NODE} && nvm use`);
  console.error(`- volta: volta install node@${REQUIRED_NODE} pnpm@${REQUIRED_PNPM}`);
  console.error(`- asdf: asdf install nodejs ${REQUIRED_NODE} && asdf local nodejs ${REQUIRED_NODE}`);
  console.error("");
  process.exit(1);
}
