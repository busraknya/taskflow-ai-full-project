import { IsString, IsUUID, IsOptional, IsInt, Min, Max, IsDateString, IsEnum, MaxLength } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 10_000;

export class CreateTaskDto {
  @IsString()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title!: string;

  @IsString()
  @MaxLength(TASK_DESCRIPTION_MAX_LENGTH)
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