import type { FastifyReply, FastifyRequest } from "fastify";

export interface ApiSuccessEnvelope<T> {
  code: "OK";
  message: string;
  requestId: string;
  data: T;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export function ok<T>(request: FastifyRequest, data: T, message = "ok"): ApiSuccessEnvelope<T> {
  return {
    code: "OK",
    message,
    requestId: request.id,
    data
  };
}

export function fail(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  reply.status(status).send({
    code,
    message,
    requestId: request.id,
    details
  } satisfies ApiErrorEnvelope);
}
