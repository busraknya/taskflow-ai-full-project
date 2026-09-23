import { IsString, MinLength, Matches } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(2, { message: 'The workspace name must be at least 2 characters long.' })
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'The slug can only contain lowercase letters, numbers, and hyphens (-).' })
  slug!: string;
}