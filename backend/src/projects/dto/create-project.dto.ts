import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export const PROJECT_NAME_MAX_LENGTH = 100;

export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: 'Project name must be at least 2 characters long.' })
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}
