import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceMemberGuard } from './workspace-member.guard';

describe('WorkspaceMemberGuard', () => {
  const prisma = {
    workspace: {
      findUnique: jest.fn(),
    },
    workspaceMembership: {
      findUnique: jest.fn(),
    },
  };

  const guard = new WorkspaceMemberGuard(prisma as unknown as PrismaService);

  const createContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'workspace-1',
      deletedAt: null,
    });
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      status: 'ACTIVE',
      role: 'MEMBER',
    });
  });

  it('accepts an active member even when the request has no body', async () => {
    const request = {
      user: { id: 'user-1' },
      params: { workspaceId: 'workspace-1' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toHaveProperty('membership');
  });

  it('rejects a user without an active membership', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      status: 'PENDING',
      role: 'MEMBER',
    });

    await expect(
      guard.canActivate(
        createContext({
          user: { id: 'user-1' },
          params: { workspaceId: 'workspace-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a deleted workspace', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'workspace-1',
      deletedAt: new Date(),
    });

    await expect(
      guard.canActivate(
        createContext({
          user: { id: 'user-1' },
          params: { workspaceId: 'workspace-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.workspaceMembership.findUnique).not.toHaveBeenCalled();
  });
});
