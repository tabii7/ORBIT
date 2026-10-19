import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ApiCode, DEFAULT_SUCCESS_MESSAGE } from './api-codes';
import {
  API_RESPONSE_META,
  ApiResponseMeta,
  apiSuccess,
  isApiEnvelope,
} from './api-response';

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const res = http.getResponse<{ statusCode: number }>();
    const req = http.getRequest<{ method?: string }>();

    const meta =
      this.reflector.getAllAndOverride<ApiResponseMeta | undefined>(
        API_RESPONSE_META,
        [context.getHandler(), context.getClass()],
      ) ?? {};

    return next.handle().pipe(
      map((data) => {
        if (isApiEnvelope(data)) {
          return data;
        }

        const statusCode = res.statusCode || 200;
        const { code, message } = this.resolveMeta(
          meta,
          req.method,
          statusCode,
        );

        return apiSuccess(data ?? null, { code, message, statusCode });
      }),
    );
  }

  private resolveMeta(
    meta: ApiResponseMeta,
    method?: string,
    statusCode?: number,
  ) {
    if (meta.code || meta.message) {
      const code = meta.code ?? this.defaultCode(method, statusCode);
      return {
        code,
        message:
          meta.message ??
          DEFAULT_SUCCESS_MESSAGE[code] ??
          'Request completed successfully',
      };
    }

    const code = this.defaultCode(method, statusCode);
    return {
      code,
      message:
        DEFAULT_SUCCESS_MESSAGE[code] ?? 'Request completed successfully',
    };
  }

  private defaultCode(method?: string, statusCode?: number) {
    if (statusCode === 201 || method === 'POST') return ApiCode.CREATED;
    if (method === 'DELETE') return ApiCode.DELETED;
    if (method === 'PUT' || method === 'PATCH') return ApiCode.UPDATED;
    if (method === 'GET') return ApiCode.FETCHED;
    return ApiCode.SUCCESS;
  }
}
