import type { SessionClaims } from "../auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    authClaims?: SessionClaims;
    sessionClaims?: SessionClaims;
  }
}
