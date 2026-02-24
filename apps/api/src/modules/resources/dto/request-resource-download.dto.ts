import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestResourceDownloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  public anonymousId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  public source?: string;
}
