import { IsBoolean } from 'class-validator';

export class UpdateUserAssistantAccessDto {
  @IsBoolean()
  public enabled!: boolean;
}
