import { Module } from '@nestjs/common';
import { ProductivityModule } from '../productivity/productivity.module';
import { BusinessController } from './business.controller';
import { BusinessNotesService } from './business-notes.service';
import { BusinessResearchService } from './business-research.service';

@Module({
  imports: [ProductivityModule],
  controllers: [BusinessController],
  providers: [BusinessNotesService, BusinessResearchService],
  exports: [BusinessNotesService, BusinessResearchService],
})
export class BusinessModule {}
