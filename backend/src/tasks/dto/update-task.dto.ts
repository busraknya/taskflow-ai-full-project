import { IsString, IsUUID, IsOptional, IsInt, Min, Max, IsDateString, IsEnum, MaxLength } from 'class-validator';
import { TaskStatus } from '@prisma/client';
import {
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from './create-task.dto';

export class UpdateTaskDto {
  @IsString()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(TASK_DESCRIPTION_MAX_LENGTH)
  @IsOptional()
  description?: string;

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
  assigneeId?: string | null;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;

  @IsInt()
  @IsOptional()
  position?: number;

  @IsInt()
  @Min(0)
  version!: number;

  /** Time the change was made on a client while offline (informational). */
  @IsDateString()
  @IsOptional()
  clientOccurredAt?: string;
}