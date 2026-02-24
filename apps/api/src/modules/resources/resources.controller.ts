import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { LogResourceAccessDto } from './dto/log-resource-access.dto';
import { RequestResourceDownloadDto } from './dto/request-resource-download.dto';
import { ResourcesService } from './resources.service';

@Controller('api/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  public listResources(@Req() request: Request) {
    return this.resourcesService.listResources(request);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  public listMyResources(@Req() request: Request) {
    return this.resourcesService.listAuthenticatedResources(request);
  }

  @Post(':resourceId/access')
  @HttpCode(HttpStatus.OK)
  public logResourceAccess(
    @Req() request: Request,
    @Param('resourceId') resourceId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: LogResourceAccessDto,
  ) {
    return this.resourcesService.logResourceAccess(request, resourceId, body);
  }

  @Post(':resourceId/download')
  @HttpCode(HttpStatus.OK)
  public requestResourceDownload(
    @Req() request: Request,
    @Param('resourceId') resourceId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: RequestResourceDownloadDto,
  ) {
    return this.resourcesService.requestResourceDownload(
      request,
      resourceId,
      body,
    );
  }
}
