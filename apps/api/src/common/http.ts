import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError, type ZodType } from 'zod';

export class DomainException extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    super({ code, message, ...(details ? { details } : {}) }, status);
  }
}

export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new DomainException(400, 'VALIDATION_ERROR', 'Request validation failed.', error.flatten());
    }
    throw error;
  }
}

export function requiredRm(value: string | undefined): string {
  if (!value) throw new DomainException(400, 'RM_REQUIRED', 'X-RM-ID header is required.');
  return value;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object') return response.status(status).json(body);
      return response.status(status).json({ code: `HTTP_${status}`, message: body });
    }
    console.error('Unhandled request error', exception instanceof Error ? exception.message : 'Unknown error');
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
    });
  }
}

