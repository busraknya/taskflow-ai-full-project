import { IsTimeZone } from 'class-validator';

export class UpdateWorkspaceSettingsDto {
  /** IANA time zone; date-only due dates end at midnight in this zone. */
  @IsTimeZone()
  timezone!: string;
}
