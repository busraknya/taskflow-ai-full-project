import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export const PROJECT_NAME_MAX_LENGTH = 100;

export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: 'Proje adı en az 2 karakter olmalıdır.' })
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}
