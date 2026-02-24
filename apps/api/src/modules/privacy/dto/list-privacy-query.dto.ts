import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const PRIVACY_WINDOWS = ['7d', '30d', '90d', 'all'] as const;
const DSAR_STATUS_FILTERS = [
  'ALL',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
] as const;

export type PrivacyWindow = (typeof PRIVACY_WINDOWS)[number];
export type DsarStatusFilter = (typeof DSAR_STATUS_FILTERS)[number];

export class ListPrivacyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;

  @IsOptional()
  @IsIn(PRIVACY_WINDOWS)
  public window?: PrivacyWindow;

  @IsOptional()
  @IsIn(DSAR_STATUS_FILTERS)
  public status?: DsarStatusFilter;
}
