import { IsBoolean } from 'class-validator';

export class UpdateUserAdminRoleDto {
  @IsBoolean()
  public enabled!: boolean;
}
