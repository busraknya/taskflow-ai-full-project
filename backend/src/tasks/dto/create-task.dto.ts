import { IsString, IsUUID, IsOptional, IsInt, Min, Max, IsDateString, IsEnum } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class CreateTaskDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  projectId!: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsInt()
  @Min(0)
  @Max(3)
  @IsOptional()
  priority?: number;

  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}