import type { Response } from "express";
import type { ApiErrorCode, ApiErrorResponse } from "@synoptic/types/rest";

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: ApiErrorResponse["details"];

  constructor(code: ApiErrorCode, statusCode: number, message: string, details?: ApiErrorResponse["details"]) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function sendApiError(res: Response, error: ApiError, requestId?: string): void {
  const payload: ApiErrorResponse = {
    code: error.code,
    message: error.message,
    requestId,
    details: error.details
  };

  res.status(error.statusCode).json(payload);
}
