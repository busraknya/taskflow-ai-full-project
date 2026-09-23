import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Please enter a valid e-mail address.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'The password must be at least 8 characters long.' })
  @Matches(/\d/, { message: 'The password must contain at least one digit.' })
  password!: string;

  @IsString()
  fullName!: string;
}