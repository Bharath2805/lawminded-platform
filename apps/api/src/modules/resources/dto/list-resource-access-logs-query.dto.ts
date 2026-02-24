import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const ACCESS_LOG_WINDOWS = ['7d', '30d', '90d', 'all'] as const;

export type ResourceAccessLogWindow = (typeof ACCESS_LOG_WINDOWS)[number];

export class ListResourceAccessLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  public limit?: number;

  @IsOptional()
  @IsIn(ACCESS_LOG_WINDOWS)
  public window?: ResourceAccessLogWindow;
}
