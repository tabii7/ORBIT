import { SetMetadata } from '@nestjs/common';
import { API_RESPONSE_META, ApiResponseMeta } from './api-response';

/** Attach success code + message for the global response interceptor. */
export const ApiSuccess = (meta: ApiResponseMeta) =>
  SetMetadata(API_RESPONSE_META, meta);
