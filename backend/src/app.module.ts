import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq'; 
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { AuditModule } from './common/audit/audit.module';
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST');
        const port = configService.get<string>('REDIS_PORT');

        if (!host || !port) {
          throw new Error('FATAL: REDIS_HOST or REDIS_PORT is missing in environment variables!');
        }

        return {
          connection: {
            host: host,
            port: parseInt(port, 10),
            protocol: 'resp2'
          },
        };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    AiModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}