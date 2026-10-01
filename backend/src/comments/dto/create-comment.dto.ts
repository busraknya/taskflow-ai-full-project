import { IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: 'Yorum içeriği boş olamaz.' })
  body!: string;
}