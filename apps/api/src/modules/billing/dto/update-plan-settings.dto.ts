import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePlanSettingsDto {
  @IsOptional()
  @IsBoolean()
  public active?: boolean;

  @IsOptional()
  @IsBoolean()
  public chatbotEnabled?: boolean;
}
