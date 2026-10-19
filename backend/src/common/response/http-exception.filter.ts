import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { errorCodeFromStatus, ApiCode } from './api-codes';
import { apiError } from './api-response';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown;
    let code: string = ApiCode.INTERNAL_ERROR;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      code = errorCodeFromStatus(statusCode);

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          errors = obj.message;
          code = ApiCode.VALIDATION_ERROR;
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        } else {
          message = exception.message;
        }
        // Allow field-map errors: { errors: { fullName: '...' } }
        if (
          obj.errors &&
          typeof obj.errors === 'object' &&
          !Array.isArray(obj.errors)
        ) {
          errors = obj.errors;
          if (statusCode === 400) code = ApiCode.VALIDATION_ERROR;
        }
        if (typeof obj.error === 'string' && statusCode >= 500) {
          errors = obj.error;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Unknown exception: ${String(exception)}`);
    }

    const payload = apiError({
      message,
      code,
      statusCode,
      errors,
    });

    res.status(statusCode).json(payload);
  }
}
