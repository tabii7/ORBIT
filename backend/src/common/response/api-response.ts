import { ApiCode, DEFAULT_SUCCESS_MESSAGE } from './api-codes';

/**
 * ONE response template for every ORBIT API (success + error).
 *
 * Always present keys:
 *   success, code, message, statusCode, data, errors
 */
export type ApiResponse<T = unknown> = {
  success: boolean;
  code: string;
  message: string;
  statusCode: number;
  data: T | null;
  errors: unknown;
};

export type ApiSuccessResponse<T = unknown> = ApiResponse<T> & {
  success: true;
  data: T;
  errors: null;
};

export type ApiErrorResponse = ApiResponse<null> & {
  success: false;
  data: null;
};

export type ApiEnvelope<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export const API_RESPONSE_META = 'orbit:api_response_meta';

export type ApiResponseMeta = {
  code?: string;
  message?: string;
};

/** Build a success envelope. Controllers return raw data; interceptor wraps it. */
export function apiSuccess<T>(
  data: T,
  options?: {
    code?: string;
    message?: string;
    statusCode?: number;
  },
): ApiSuccessResponse<T> {
  const code = options?.code ?? ApiCode.SUCCESS;
  return {
    success: true,
    code,
    message:
      options?.message ??
      DEFAULT_SUCCESS_MESSAGE[code] ??
      'Request completed successfully',
    statusCode: options?.statusCode ?? 200,
    data,
    errors: null,
  };
}

export function apiError(options: {
  message: string;
  code?: string;
  statusCode?: number;
  errors?: unknown;
}): ApiErrorResponse {
  const statusCode = options.statusCode ?? 400;
  let errors: unknown = null;
  if (Array.isArray(options.errors)) {
    errors = options.errors;
  } else if (typeof options.errors === 'string' && options.errors.trim()) {
    errors = [options.errors];
  } else if (
    options.errors != null &&
    typeof options.errors === 'object'
  ) {
    // Field-map validation errors for Flutter profile contract
    errors = options.errors;
  } else if (options.errors != null) {
    errors = [options.errors];
  }

  return {
    success: false,
    code: options.code ?? ApiCode.BAD_REQUEST,
    message: options.message,
    statusCode,
    data: null,
    errors,
  };
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'code' in value &&
    'message' in value &&
    'statusCode' in value &&
    'data' in value &&
    'errors' in value
  );
}
