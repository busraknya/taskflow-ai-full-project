import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Beklenmeyen bir sunucu hatası oluştu.';
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
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      code: errorCode,
      message,
      details,
    });
  }
}
