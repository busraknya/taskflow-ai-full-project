import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long.' })
  @Matches(/\d/, { message: 'New password must contain at least one number.' })
  newPassword!: string;
}