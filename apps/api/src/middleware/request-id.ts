import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("x-request-id");
  const requestId = header && header.length > 0 ? header : randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
