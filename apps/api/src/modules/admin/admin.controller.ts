import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AdminService } from './admin.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserAdminRoleDto } from './dto/update-user-admin-role.dto';
import { UpdateUserAssistantAccessDto } from './dto/update-user-assistant-access.dto';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  public getOverview() {
    return this.adminService.getOverview();
  }

  @Get('users')
  public listUsers(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListUsersQueryDto,
  ) {
    return this.adminService.listUsers(query.limit ?? 25, query.search);
  }

  @Get('billing')
  public listBilling(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListUsersQueryDto,
  ) {
    return this.adminService.listBilling(query.limit ?? 25);
  }

  @Patch('users/:userId/status')
  public updateUserStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(user.id, userId, body.status);
  }

  @Patch('users/:userId/admin-role')
  public updateUserAdminRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateUserAdminRoleDto,
  ) {
    return this.adminService.setUserAdminRole(user.id, userId, body.enabled);
  }

  @Patch('users/:userId/assistant-access')
  public updateUserAssistantAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateUserAssistantAccessDto,
  ) {
    return this.adminService.setUserAssistantAccess(
      user.id,
      userId,
      body.enabled,
    );
  }

  @Post('users/:userId/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  public revokeUserSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    return this.adminService.revokeUserSessions(user.id, userId);
  }
}
