import { appendFileSync } from "fs";
import { getCurrentLogFile, rotateLogs, ensureSynopticDir } from "./wallet.js";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLogLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function formatLogEntry(entry: LogEntry): string {
  const parts = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`, entry.message];

  if (entry.data) {
    parts.push(JSON.stringify(entry.data));
  }

  return parts.join(" ") + "\n";
}

function writeLog(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) {
    return;
  }

  ensureSynopticDir();
  rotateLogs(10);

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  };

  const logFile = getCurrentLogFile();
  appendFileSync(logFile, formatLogEntry(entry), { encoding: "utf-8" });
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => writeLog("debug", message, data),
  info: (message: string, data?: Record<string, unknown>) => writeLog("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => writeLog("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => writeLog("error", message, data),

  child: (context: Record<string, unknown>) => ({
    debug: (message: string, data?: Record<string, unknown>) =>
      writeLog("debug", message, { ...context, ...data }),
    info: (message: string, data?: Record<string, unknown>) =>
      writeLog("info", message, { ...context, ...data }),
    warn: (message: string, data?: Record<string, unknown>) =>
      writeLog("warn", message, { ...context, ...data }),
    error: (message: string, data?: Record<string, unknown>) =>
      writeLog("error", message, { ...context, ...data })
  })
};

export default logger;
