import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please enter a valid e-mail address.' })
  email!: string;

  @IsString()
  password!: string;
}