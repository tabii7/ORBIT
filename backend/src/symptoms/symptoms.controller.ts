import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
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
import { SymptomsService } from './symptoms.service';
import { CreateSymptomDto, ListSymptomsQueryDto } from './dto/symptom.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Symptoms')
@ApiBearerAuth('JWT')
@Controller('symptoms')
@UseGuards(JwtAuthGuard)
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post()
  @ApiOperation({ summary: 'Log a symptom check-in' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSymptomDto) {
    return this.symptomsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my symptom entries' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListSymptomsQueryDto) {
    return this.symptomsService.list(user.id, query);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a symptom entry' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.symptomsService.remove(user.id, id);
  }
}
