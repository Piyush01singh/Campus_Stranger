export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  CONVERSATION_ENDED = 'CONVERSATION_ENDED',
  USER_BLOCKED = 'USER_BLOCKED',
}

export interface IApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface IApiError {
  code: ErrorCode | string;
  message: string;
  statusCode: number;
  details?: IApiErrorDetail[];
}

export interface IApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
}

export interface IApiErrorResponse {
  success: false;
  error: IApiError;
  timestamp: string;
  requestId?: string;
}

export type ApiSuccessResponse<T> = IApiSuccessResponse<T>;
export type ApiErrorResponse = IApiErrorResponse;
export type ApiResponse<T> = IApiSuccessResponse<T> | IApiErrorResponse;

export interface IHealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services?: {
    database?: 'connected' | 'disconnected';
    redis?: 'connected' | 'disconnected';
  };
}
