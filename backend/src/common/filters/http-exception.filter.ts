import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Beklenmeyen bir sunucu hatası oluştu.';
    let details: any = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const errObj = exceptionResponse as any;
        errorCode = errObj.code || errObj.error || 'API_ERROR';
        message = errObj.message || exception.message;
        
        if (Array.isArray(errObj.message)) {
          message = 'Validasyon hatası.';
          details = { fields: errObj.message };
        } else {
          details = errObj.details || {};
        }
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      code: errorCode,
      message: message,
      details: details,
    });
  }
}