import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Prisma xatolarini tushunarli HTTP javoblarga aylantiradi */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Ichki server xatosi';

    const raw = exception.message ?? '';
    if (raw.includes('23P01') || raw.includes('exclusion constraint')) {
      status = HttpStatus.CONFLICT;
      message = "Vaqt oralig'i shu kanaldagi boshqa slot bilan to'qnashadi";
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = exception.meta?.target;
          status = HttpStatus.CONFLICT;
          message = `Bu qiymat allaqachon mavjud: ${Array.isArray(target) ? target.join(', ') : String(target ?? '')}`;
          break;
        }
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message = "Bog'liq yozuvlar mavjud (masalan dastur jadvalda ishlatilgan)";
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Yozuv topilmadi';
          break;
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(raw, exception.stack);
    if (res.headersSent) return;
    res.status(status).json({ statusCode: status, message });
  }
}
