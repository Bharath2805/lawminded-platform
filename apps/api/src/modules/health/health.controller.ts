import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  public root() {
    return {
      message: 'LawMinded API (NestJS)',
      status: 'ok',
    };
  }

  @Get('health')
  public health() {
    return this.healthService.health();
  }

  @Get('ready')
  public async ready() {
    const readiness = await this.healthService.ready();

    if (!readiness.ready) {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}
