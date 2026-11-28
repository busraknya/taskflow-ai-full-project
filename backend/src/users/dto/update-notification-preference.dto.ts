import { IsBoolean, IsIn } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsIn(['task.assigned'])
  category!: string;

  @IsBoolean()
  emailEnabled!: boolean;
}
