import {
  ResourceDeliveryType,
  ResourceEntitlementMode,
  ResourceVisibility,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @MaxLength(64)
  public key!: string;

  @IsString()
  @MaxLength(160)
  public title!: string;

  @IsString()
  @MaxLength(600)
  public summary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  public category?: string;

  @Matches(/^(\/|https?:\/\/).+/i)
  @MaxLength(500)
  public href!: string;

  @IsOptional()
  @IsEnum(ResourceVisibility)
  public visibility?: ResourceVisibility;

  @IsOptional()
  @IsEnum(ResourceDeliveryType)
  public deliveryType?: ResourceDeliveryType;

  @IsOptional()
  @IsEnum(ResourceEntitlementMode)
  public entitlementMode?: ResourceEntitlementMode;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  public entitledPlanKeys?: string[];

  @IsOptional()
  @IsBoolean()
  public active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  public sortOrder?: number;
}
