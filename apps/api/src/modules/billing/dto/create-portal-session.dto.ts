import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePortalSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  returnPath?: string;
}
