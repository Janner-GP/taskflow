import { Global, Module } from '@nestjs/common';

import { STORAGE_SERVICE } from './storage.port';
import { S3StorageService } from './s3-storage.service';

@Global()
@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: S3StorageService }],
  exports: [STORAGE_SERVICE],
})
export class S3StorageModule {}
