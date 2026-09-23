import { IsString, IsUUID, IsOptional, IsInt, Min, Max, IsDateString, IsEnum, IsNumber } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
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

  @IsNumber()
  version!: number;
}