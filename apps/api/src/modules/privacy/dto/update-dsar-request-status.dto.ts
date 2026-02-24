import { DsarRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDsarRequestStatusDto {
  @IsEnum(DsarRequestStatus)
  public status!: DsarRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  public resolutionNote?: string;
}
