import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 120;
const DEFAULT_STORAGE_PREFIX = 'lawminded';

type UploadUrlParams = {
  resourceId: string;
  fileName: string;
  mimeType: string;
};

type UploadUrlResult = {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  bucket: string;
  requiredHeaders: {
    'Content-Type': string;
  };
};

type DownloadUrlParams = {
  storageKey: string;
  fileName: string;
};

type StorageStatus = {
  configured: boolean;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  keyPrefix: string;
  missingRequiredEnvKeys: string[];
  missingOptionalEnvKeys: string[];
};

@Injectable()
export class StorageService {
  private readonly bucket: string | null;
  private readonly region: string;
  private readonly endpoint: string | null;
  private readonly accessKeyId: string | null;
  private readonly secretAccessKey: string | null;
  private readonly forcePathStyle: boolean;
  private readonly signedUrlTtlSeconds: number;
  private readonly keyPrefix: string;

  private readonly s3Client: S3Client | null;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.getOptionalTrimmed('STORAGE_BUCKET');
    this.region = this.getOptionalTrimmed('STORAGE_REGION') ?? 'auto';
    this.endpoint = this.getOptionalTrimmed('STORAGE_ENDPOINT');
    this.accessKeyId = this.getOptionalTrimmed('STORAGE_ACCESS_KEY_ID');
    this.secretAccessKey = this.getOptionalTrimmed('STORAGE_SECRET_ACCESS_KEY');
    this.forcePathStyle = this.parseBoolean(
      this.configService.get<string>('STORAGE_FORCE_PATH_STYLE'),
    );

    const ttlRaw = Number(
      this.configService.get<string>('STORAGE_SIGNED_URL_TTL_SECONDS') ??
        `${DEFAULT_SIGNED_URL_TTL_SECONDS}`,
    );

    this.signedUrlTtlSeconds =
      Number.isFinite(ttlRaw) && ttlRaw > 0 && ttlRaw <= 3600
        ? Math.floor(ttlRaw)
        : DEFAULT_SIGNED_URL_TTL_SECONDS;

    this.keyPrefix =
      this.getOptionalTrimmed('STORAGE_KEY_PREFIX') ?? DEFAULT_STORAGE_PREFIX;

    if (this.isConfigured()) {
      this.s3Client = new S3Client({
        region: this.region,
        endpoint: this.endpoint ?? undefined,
        forcePathStyle: this.forcePathStyle,
        credentials: {
          accessKeyId: this.accessKeyId as string,
          secretAccessKey: this.secretAccessKey as string,
        },
      });
    } else {
      this.s3Client = null;
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.bucket && this.accessKeyId && this.secretAccessKey);
  }

  public getBucket(): string {
    this.assertConfigured();
    return this.bucket as string;
  }

  public getStorageStatus(): StorageStatus {
    const requiredEnv = [
      { key: 'STORAGE_BUCKET', value: this.bucket },
      { key: 'STORAGE_ACCESS_KEY_ID', value: this.accessKeyId },
      { key: 'STORAGE_SECRET_ACCESS_KEY', value: this.secretAccessKey },
    ];

    const optionalEnv = [
      {
        key: 'STORAGE_REGION',
        value: this.getOptionalTrimmed('STORAGE_REGION'),
      },
      {
        key: 'STORAGE_ENDPOINT',
        value: this.endpoint,
      },
      {
        key: 'STORAGE_FORCE_PATH_STYLE',
        value:
          this.configService.get<string>('STORAGE_FORCE_PATH_STYLE') ?? null,
      },
      {
        key: 'STORAGE_SIGNED_URL_TTL_SECONDS',
        value:
          this.configService.get<string>('STORAGE_SIGNED_URL_TTL_SECONDS') ??
          null,
      },
      {
        key: 'STORAGE_KEY_PREFIX',
        value: this.getOptionalTrimmed('STORAGE_KEY_PREFIX'),
      },
    ];

    return {
      configured: this.isConfigured(),
      bucket: this.bucket,
      region: this.getOptionalTrimmed('STORAGE_REGION'),
      endpoint: this.endpoint,
      keyPrefix: this.keyPrefix,
      missingRequiredEnvKeys: requiredEnv
        .filter((entry) => !entry.value)
        .map((entry) => entry.key),
      missingOptionalEnvKeys: optionalEnv
        .filter((entry) => !entry.value)
        .map((entry) => entry.key),
    };
  }

  public async createResourceUploadUrl(
    input: UploadUrlParams,
  ): Promise<UploadUrlResult> {
    this.assertConfigured();

    const safeFileName = this.sanitizeFileName(input.fileName);
    const extension = extname(safeFileName).toLowerCase();
    const randomSuffix = randomBytes(8).toString('hex');
    const storageKey = `${this.keyPrefix}/resources/${input.resourceId}/${Date.now()}_${randomSuffix}${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket as string,
      Key: storageKey,
      ContentType: input.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client as S3Client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });

    return {
      uploadUrl,
      storageKey,
      expiresInSeconds: this.signedUrlTtlSeconds,
      bucket: this.bucket as string,
      requiredHeaders: {
        'Content-Type': input.mimeType,
      },
    };
  }

  public async createResourceDownloadUrl(
    input: DownloadUrlParams,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    this.assertConfigured();

    const safeFileName = this.sanitizeFileName(input.fileName);

    const command = new GetObjectCommand({
      Bucket: this.bucket as string,
      Key: input.storageKey,
      ResponseContentDisposition: `attachment; filename="${safeFileName}"`,
    });

    const url = await getSignedUrl(this.s3Client as S3Client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });

    return {
      url,
      expiresInSeconds: this.signedUrlTtlSeconds,
    };
  }

  public async assertObjectExists(
    storageKey: string,
    expectedSizeBytes?: number,
  ): Promise<void> {
    this.assertConfigured();

    const result = await (this.s3Client as S3Client).send(
      new HeadObjectCommand({
        Bucket: this.bucket as string,
        Key: storageKey,
      }),
    );

    if (
      typeof expectedSizeBytes === 'number' &&
      Number.isFinite(expectedSizeBytes) &&
      expectedSizeBytes > 0 &&
      typeof result.ContentLength === 'number' &&
      result.ContentLength !== expectedSizeBytes
    ) {
      throw new InternalServerErrorException(
        'Uploaded object size does not match expected size',
      );
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured() || !this.s3Client) {
      throw new InternalServerErrorException(
        'Storage is not configured. Set STORAGE_* environment variables.',
      );
    }
  }

  private sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();

    if (!trimmed) {
      return 'resource-file';
    }

    const sanitized = trimmed
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 180);

    return sanitized || 'resource-file';
  }

  private getOptionalTrimmed(key: string): string | null {
    const value = this.configService.get<string>(key);

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseBoolean(value: string | undefined): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
}
