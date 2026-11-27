import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

const GENERIC_ERROR_MESSAGE = 'Beklenmeyen bir sunucu hatası oluştu.';

/**
 * Errors created with the `http-errors` package (e.g. by body-parser for an
 * oversized or malformed body) mark client-safe messages with `expose: true`.
 */
interface ExposedClientHttpError {
  status: number;
  message: string;
}

function asExposedClientHttpError(
  exception: unknown,
): ExposedClientHttpError | null {
  if (typeof exception !== 'object' || exception === null) {
    return null;
  }
  const candidate = exception as Record<string, unknown>;
  const status = candidate.status ?? candidate.statusCode;
  if (
    candidate.expose === true &&
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 499 &&
    typeof candidate.message === 'string'
  ) {
    return { status, message: candidate.message };
  }
  return null;
}

function isPrismaError(exception: unknown): exception is Error {
  return (
    exception instanceof Prisma.PrismaClientKnownRequestError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientRustPanicError ||
    exception instanceof Prisma.PrismaClientInitializationError ||
    exception instanceof Prisma.PrismaClientValidationError
  );
}

/**
 * Only the "    at ..." frames of a stack. Prisma messages can span several
 * lines and include query arguments, so every message line is dropped, not
 * just the first one.
 */
function stackFramesOnly(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line))
    .join('\n');
  return frames || undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = GENERIC_ERROR_MESSAGE;
    let details: unknown = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const errorResponse = exceptionResponse as Record<string, unknown>;
        const code = errorResponse.code ?? errorResponse.error;
        const responseMessage = errorResponse.message;

        if (typeof code === 'string') {
          errorCode = code;
        }

        if (Array.isArray(responseMessage)) {
          message = 'Validasyon hatası.';
          details = { fields: responseMessage };
        } else if (typeof responseMessage === 'string') {
          message = responseMessage;
          details = errorResponse.details ?? {};
        } else {
          message = exception.message;
          details = errorResponse.details ?? {};
        }
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }
    } else {
      const clientError = asExposedClientHttpError(exception);
      if (clientError) {
        status = clientError.status;
        errorCode = STATUS_CODES[clientError.status] ?? errorCode;
        message = clientError.message;
      } else {
        // Unexpected failure: the client only sees the generic message; the
        // details are logged server-side.
        this.logUnexpected(exception, ctx.getRequest<Request>());
      }
    }

    response.status(status).json({
      statusCode: status,
      code: errorCode,
      message,
      details,
    });
  }

  private logUnexpected(exception: unknown, request: Request | undefined) {
    const method = request?.method ?? 'UNKNOWN';
    const path = (request?.originalUrl ?? request?.url ?? '').split('?')[0];
    const where = `${method} ${path}`;

    if (isPrismaError(exception)) {
      const code =
        'code' in exception && typeof exception.code === 'string'
          ? ` (code=${exception.code})`
          : '';
      // The Prisma message may contain query arguments or personal data.
      this.logger.error(
        `Unhandled ${exception.constructor.name}${code} on ${where}`,
        stackFramesOnly(exception.stack),
      );
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled ${exception.constructor.name} on ${where}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Unhandled non-Error value (${typeof exception}) on ${where}`,
      );
    }
  }
}
