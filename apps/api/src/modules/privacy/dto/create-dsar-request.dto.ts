import { DsarRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDsarRequestDto {
  @IsEnum(DsarRequestType)
  public type!: DsarRequestType;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  public details?: string;
}
