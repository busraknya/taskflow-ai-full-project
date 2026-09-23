import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2, { message: 'Proje adı en az 2 karakter olmalıdır.' })
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}