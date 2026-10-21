import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { SubmitHealthCheckDto } from './dto/health-check.dto';
import { HealthCheckService } from './health-check.service';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Health Check')
@ApiBearerAuth('JWT')
@Controller('health-check')
@UseGuards(JwtAuthGuard)
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get('questions')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Health check questions fetched successfully',
  })
  @ApiOperation({
    summary: 'Get health check quiz questions',
    description:
      'Fixed wellness quiz for the main page. Options omit point values (scoring is server-side). Not a medical diagnosis.',
  })
  getQuestions() {
    return this.healthCheckService.getQuestions();
  }

  @Get('latest')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Latest health check fetched successfully',
  })
  @ApiOperation({
    summary: 'Get my latest health check result',
    description: 'For home screen. `hasResult: false` if never completed.',
  })
  getLatest(@CurrentUser() user: AuthUser) {
    return this.healthCheckService.getLatest(user.id);
  }

  @Get('history')
  @ApiSuccess({
    code: ApiCode.FETCHED,
    message: 'Health check history fetched successfully',
  })
  @ApiQuery({ name: 'take', required: false, example: 10 })
  @ApiOperation({ summary: 'List my recent health check results' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('take') take?: string,
  ) {
    const n = take ? Number(take) : 10;
    return this.healthCheckService.list(user.id, Number.isFinite(n) ? n : 10);
  }

  @Post()
  @HttpCode(201)
  @ApiSuccess({
    code: ApiCode.HEALTH_CHECK_SUBMITTED,
    message: 'Health check submitted successfully',
  })
  @ApiOperation({
    summary: 'Submit health check answers',
    description:
      'Send one answer per question. Returns score, level (GOOD|FAIR|NEEDS_ATTENTION), tips, and disclaimer.',
  })
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitHealthCheckDto) {
    return this.healthCheckService.submit(user.id, dto);
  }
}
