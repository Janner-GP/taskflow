import { createHash } from 'node:crypto';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import type { StorageServicePort } from './storage.port';

@Injectable()
export class S3StorageService implements StorageServicePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.region = config.get('AWS_REGION', { infer: true });
    this.bucket = config.get('S3_BUCKET_NAME', { infer: true });
    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  async upload(
    buffer: Buffer,
    mimeType: string,
    ext: string,
  ): Promise<{ url: string; key: string }> {
    const hash = createHash('sha256').update(buffer).digest('hex');
    const key = `tasks/${hash}.${ext}`;
    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    // Deduplicación: si el objeto ya existe, devuelve la URL sin re-subir.
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { url, key };
    } catch {
      // No existe — continuar con la subida.
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return { url, key };
  }

  async deleteIfOrphaned(key: string, currentTaskId: string): Promise<void> {
    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    const otherRefs = await this.prisma.task.count({
      where: { attachmentUrl: url, id: { not: currentTaskId } },
    });

    if (otherRefs === 0) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    }
  }
}
