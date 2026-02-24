import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

export class ListChatConversationsQueryDto {
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  public includeArchived?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  public search?: string;
}
