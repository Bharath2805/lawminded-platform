import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ChatStreamRequestDto {
  @IsOptional()
  @IsUUID('4')
  public conversation_id?: string;

  @IsOptional()
  @IsString()
  public thread_id?: string;

  @IsString()
  @MaxLength(12000)
  public message!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public uploaded_file_ids?: string[];
}
