import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChatConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  public title?: string;

  @IsOptional()
  @IsBoolean()
  public isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  public isArchived?: boolean;
}
