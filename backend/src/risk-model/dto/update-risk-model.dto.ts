import { IsBoolean } from 'class-validator';

export class UpdateRiskModelDto {
  @IsBoolean()
  trainingEnabled!: boolean;
}
