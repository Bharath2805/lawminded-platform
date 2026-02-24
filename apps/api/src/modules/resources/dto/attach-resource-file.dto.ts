import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AttachResourceFileDto {
  @IsString()
  @MaxLength(1024)
  public storageKey!: string;

  @IsString()
  @MaxLength(180)
  public fileName!: string;

  @IsString()
  @Matches(/^[\w!#$&^.+-]{1,127}\/[\w!#$&^.+-]{1,127}$/)
  @MaxLength(255)
  public mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  public sizeBytes!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  public checksumSha256?: string;
}
