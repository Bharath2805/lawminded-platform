import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });

    this.client.on('error', (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  public async ping(): Promise<string> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }

    return this.client.ping();
  }

  public onModuleDestroy(): Promise<'OK'> {
    if (this.client.status === 'end') {
      return Promise.resolve('OK');
    }

    return this.client.quit().catch(() => 'OK');
  }
}
