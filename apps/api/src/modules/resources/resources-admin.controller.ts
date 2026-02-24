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
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CreateResourceDto } from './dto/create-resource.dto';
import { AttachResourceFileDto } from './dto/attach-resource-file.dto';
import { CreateResourceUploadUrlDto } from './dto/create-resource-upload-url.dto';
import { ListResourceAccessLogsQueryDto } from './dto/list-resource-access-logs-query.dto';
import { ListResourceQueryDto } from './dto/list-resource-query.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService } from './resources.service';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/admin/resources')
export class ResourcesAdminController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  public listResources(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListResourceQueryDto,
  ) {
    return this.resourcesService.listAdminResources(query.limit ?? 50);
  }

  @Get('storage-status')
  public getStorageStatus() {
    return this.resourcesService.getAdminStorageStatus();
  }

  @Post()
  public createResource(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateResourceDto,
  ) {
    return this.resourcesService.createResource(user.id, body);
  }

  @Patch(':resourceId')
  public updateResource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resourceId') resourceId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateResourceDto,
  ) {
    return this.resourcesService.updateResource(user.id, resourceId, body);
  }

  @Post(':resourceId/file-upload-url')
  @HttpCode(HttpStatus.OK)
  public createFileUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resourceId') resourceId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateResourceUploadUrlDto,
  ) {
    return this.resourcesService.createResourceFileUploadUrl(
      user.id,
      resourceId,
      body,
    );
  }

  @Post(':resourceId/file')
  @HttpCode(HttpStatus.OK)
  public attachFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resourceId') resourceId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: AttachResourceFileDto,
  ) {
    return this.resourcesService.attachResourceFile(user.id, resourceId, body);
  }

  @Get('access-logs')
  public listAccessLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListResourceAccessLogsQueryDto,
  ) {
    return this.resourcesService.listResourceAccessLogs(
      query.limit ?? 50,
      query.window ?? '30d',
    );
  }
}
