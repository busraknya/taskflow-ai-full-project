import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../logging/log-sanitizer';

interface LogAuditParams {
  workspaceId: string;
  actorId: string;
  entityType: 'WORKSPACE' | 'PROJECT' | 'TASK' | 'COMMENT' | 'MEMBERSHIP';
  entityId: string;
  action: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: LogAuditParams) {
    try {
      await this.prisma.auditLogEntry.create({
        data: {
          workspaceId: params.workspaceId,
          actorId: params.actorId,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          metadata: params.metadata || {},
        },
      });
    } catch (error) {
      // Metadata can contain user content, so it is not logged.
      const { summary, stack } = describeError(error);
      this.logger.error(
        `Failed to write audit log (${params.entityType} ${params.action}, entity ${params.entityId}): ${summary}`,
        stack,
      );
    }
  }
}