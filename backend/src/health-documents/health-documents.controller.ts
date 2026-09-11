import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HealthDocumentsService } from './health-documents.service';
import { CreateHealthDocumentDto } from './dto/health-document.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Health Documents')
@ApiBearerAuth('JWT')
@Controller('health-documents')
@UseGuards(JwtAuthGuard)
export class HealthDocumentsController {
  constructor(
    private readonly healthDocumentsService: HealthDocumentsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Save health document metadata' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHealthDocumentDto,
  ) {
    return this.healthDocumentsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my health documents' })
  list(@CurrentUser() user: AuthUser) {
    return this.healthDocumentsService.list(user.id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a health document' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.healthDocumentsService.remove(user.id, id);
  }
}
