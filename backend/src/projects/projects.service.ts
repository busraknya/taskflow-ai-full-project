import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllInWorkspace(workspaceId: string) {
    return this.prisma.project.findMany({
      where: {
        workspaceId,
        deletedAt: null, 
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
