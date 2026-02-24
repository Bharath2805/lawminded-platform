import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCookiePreferencesDto {
  @IsBoolean()
  public analytics!: boolean;

  @IsBoolean()
  public marketing!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  public anonymousId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  public policyVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  public source?: string;
}
