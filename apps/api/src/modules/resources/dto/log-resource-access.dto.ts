import { ResourceAccessAction } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class LogResourceAccessDto {
  @IsOptional()
  @IsEnum(ResourceAccessAction)
  public action?: ResourceAccessAction;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  public anonymousId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  public source?: string;
}
