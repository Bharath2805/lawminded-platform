import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResourceUploadUrlDto {
  @IsString()
  @MaxLength(180)
  public fileName!: string;

  @IsString()
  @Matches(/^[\w!#$&^.+-]{1,127}\/[\w!#$&^.+-]{1,127}$/)
  @MaxLength(255)
  public mimeType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  public sizeBytes?: number;
}
