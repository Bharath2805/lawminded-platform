import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDemoRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  workEmail!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  company!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  teamSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  useCase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  message?: string;
}
