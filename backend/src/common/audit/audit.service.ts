import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface LogAuditParams {
  workspaceId: string;
  actorId: string;
  entityType: 'WORKSPACE' | 'PROJECT' | 'TASK' | 'COMMENT';
  entityId: string;
  action: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
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
      console.error('Failed to write audit log:', error);
    }
  }
}