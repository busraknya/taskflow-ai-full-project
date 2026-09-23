import { PrismaClient, WorkspaceRole, MembershipStatus, TaskStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database (Prisma 7 / Driver Adapter)...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Demo Users
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.taskflow.local' },
    update: {},
    create: {
      email: 'owner@demo.taskflow.local',
      fullName: 'Ayşe (Owner)',
      passwordHash,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.taskflow.local' },
    update: {},
    create: {
      email: 'admin@demo.taskflow.local',
      fullName: 'Mert (Admin)',
      passwordHash,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@demo.taskflow.local' },
    update: {},
    create: {
      email: 'member@demo.taskflow.local',
      fullName: 'Zeynep (Member)',
      passwordHash,
    },
  });

  // 2. Demo Workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme-studio' },
    update: {},
    create: {
      name: 'Acme Studio',
      slug: 'acme-studio',
    },
  });

  // 3. Membership
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: owner.id, role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: admin.id, role: WorkspaceRole.ADMIN, status: MembershipStatus.ACTIVE },
  });

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: member.id, role: WorkspaceRole.MEMBER, status: MembershipStatus.ACTIVE },
  });

  // 4. Demo Projects and Tasks
  await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: 'V1 Launch',
      description: 'TaskFlow AI initial release project',
      tasks: {
        create: [
          {
            workspaceId: workspace.id,
            title: 'Setup Database and Prisma',
            description: 'Configure PostgreSQL and Prisma schemas.',
            status: TaskStatus.DONE,
            priority: 2,
            assigneeId: owner.id,
          },
          {
            workspaceId: workspace.id,
            title: 'Implement Authentication API',
            description: 'JWT and Refresh token mechanism.',
            status: TaskStatus.IN_PROGRESS,
            priority: 3,
            assigneeId: admin.id,
          },
        ],
      },
    },
  });

  console.log('✅ Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });