import { Module } from '@nestjs/common';
import { HealthDocumentsController } from './health-documents.controller';
import { HealthDocumentsService } from './health-documents.service';

@Module({
  controllers: [HealthDocumentsController],
  providers: [HealthDocumentsService],
  exports: [HealthDocumentsService],
})
export class HealthDocumentsModule {}
