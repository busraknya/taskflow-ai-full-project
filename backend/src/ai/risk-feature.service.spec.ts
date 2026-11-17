import { Test, TestingModule } from '@nestjs/testing';
import { RiskFeatureService } from './risk-feature.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RiskFeatureService (Unit Test)', () => {
  let service: RiskFeatureService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskFeatureService,
        {
          provide: PrismaService,
          useValue: {
            task: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'task-1',
                workspaceId: 'workspace-1',
                dueDate: new Date(Date.now() + 86400000 * 2), 
                assigneeId: 'user-1',
                priority: 2,
              }),
              count: jest.fn().mockResolvedValue(4),
            },
            comment: {
              count: jest.fn().mockResolvedValue(2),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RiskFeatureService>(RiskFeatureService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract correct risk features for a given task', async () => {
    const features = await service.extractFeaturesForTask('task-1');
    
    expect(features).toBeDefined();
    expect(features?.priority).toBe(2);
    expect(features?.comment_count).toBe(2);
    expect((prismaService as any).task.count).toHaveBeenCalledWith({
      where: {
        assigneeId: 'user-1',
        workspaceId: 'workspace-1',
        status: { not: 'DONE' },
        deletedAt: null,
      },
    });
    expect((prismaService as any).comment.count).toHaveBeenCalledWith({
      where: { taskId: 'task-1', deletedAt: null },
    });
  });
});