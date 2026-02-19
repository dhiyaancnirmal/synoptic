export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
}
