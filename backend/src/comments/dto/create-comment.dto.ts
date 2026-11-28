import { IsString, MaxLength, MinLength } from 'class-validator';

export const COMMENT_BODY_MAX_LENGTH = 5_000;

export class CreateCommentDto {
  @IsString()
  @MinLength(1, { message: 'Comment content cannot be empty.' })
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body!: string;
}