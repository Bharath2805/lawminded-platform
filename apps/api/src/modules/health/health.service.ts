import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly storageService: StorageService,
  ) {}

  public health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  public async ready() {
    let databaseOk = false;
    let redisOk = false;
    let databaseError: string | null = null;
    let redisError: string | null = null;
    const warnings: string[] = [];

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      databaseOk = true;
    } catch (error) {
      databaseError =
        error instanceof Error ? error.message : 'Database check failed';
    }

    try {
      await this.redisService.ping();
      redisOk = true;
    } catch (error) {
      redisError =
        error instanceof Error ? error.message : 'Redis check failed';
    }

    const storageStatus = this.storageService.getStorageStatus();
    const nodeVersion = process.versions.node;
    const nodeMajor = Number(nodeVersion.split('.')[0]);
    const nodeRuntimeSupported =
      Number.isFinite(nodeMajor) && nodeMajor >= 20 && nodeMajor < 25;

    if (!storageStatus.configured) {
      warnings.push(
        `Storage not configured for FILE resources: missing ${storageStatus.missingRequiredEnvKeys.join(', ')}`,
      );
    }

    if (!nodeRuntimeSupported) {
      warnings.push(
        `Unsupported Node.js runtime ${nodeVersion}. Use Node.js 20-24 (22 LTS recommended).`,
      );
    }

    return {
      ready: databaseOk && redisOk,
      timestamp: new Date().toISOString(),
      warnings,
      checks: {
        database: { ok: databaseOk, error: databaseError },
        redis: { ok: redisOk, error: redisError },
        storage: {
          ok: storageStatus.configured,
          error: storageStatus.configured
            ? null
            : 'Storage is not configured for FILE resource uploads',
          missingRequiredEnvKeys: storageStatus.missingRequiredEnvKeys,
        },
        runtime: {
          ok: nodeRuntimeSupported,
          nodeVersion,
          error: nodeRuntimeSupported
            ? null
            : 'Unsupported Node.js version for this monorepo',
        },
      },
    };
  }
}
