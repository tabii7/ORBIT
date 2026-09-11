import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { DocumentExtractService } from './document-extract.service';

@Module({
  providers: [FileStorageService, DocumentExtractService],
  exports: [FileStorageService, DocumentExtractService],
})
export class FilesModule {}
