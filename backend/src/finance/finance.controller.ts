import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ApiCode, ApiSuccess } from '../common/response';
import { BudgetService } from './budget.service';
import { WatchlistService } from './watchlist.service';
import { FinanceAlertService } from './finance-alert.service';
import {
  CreateBudgetEntryDto,
  CreateFinanceAlertDto,
  CreateWatchlistItemDto,
  UpdateFinanceAlertDto,
} from './dto/finance.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Finance')
@ApiBearerAuth('JWT')
@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly watchlistService: WatchlistService,
    private readonly financeAlertService: FinanceAlertService,
  ) {}

  @Get('budget')
  @ApiSuccess({
    code: ApiCode.BUDGET_LIST,
    message: 'Budget entries fetched successfully',
  })
  @ApiOperation({ summary: 'List my budget entries' })
  listBudget(@CurrentUser() user: AuthUser) {
    return this.budgetService.list(user.id);
  }

  @Get('budget/summary')
  @ApiSuccess({
    code: ApiCode.BUDGET_SUMMARY,
    message: 'Budget summary fetched successfully',
  })
  @ApiOperation({ summary: 'Budget income/expense summary by category' })
  budgetSummary(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.budgetService.summary(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('budget')
  @ApiSuccess({
    code: ApiCode.BUDGET_CREATED,
    message: 'Budget entry created successfully',
  })
  @ApiOperation({ summary: 'Log income or expense' })
  createBudget(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBudgetEntryDto,
  ) {
    return this.budgetService.create(user.id, dto);
  }

  @Delete('budget/:id')
  @ApiSuccess({
    code: ApiCode.BUDGET_DELETED,
    message: 'Budget entry deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a budget entry' })
  deleteBudget(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.budgetService.remove(user.id, id);
  }

  @Get('watchlist')
  @ApiSuccess({
    code: ApiCode.WATCHLIST_LIST,
    message: 'Watchlist fetched successfully',
  })
  @ApiOperation({ summary: 'List watchlist' })
  listWatchlist(@CurrentUser() user: AuthUser) {
    return this.watchlistService.list(user.id);
  }

  @Post('watchlist')
  @ApiSuccess({
    code: ApiCode.WATCHLIST_CREATED,
    message: 'Watchlist item added successfully',
  })
  @ApiOperation({ summary: 'Add symbol to watchlist' })
  addWatchlist(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateWatchlistItemDto,
  ) {
    return this.watchlistService.add(user.id, dto);
  }

  @Delete('watchlist/:id')
  @ApiSuccess({
    code: ApiCode.WATCHLIST_DELETED,
    message: 'Watchlist item removed successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Remove watchlist item' })
  removeWatchlist(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.watchlistService.remove(user.id, id);
  }

  @Get('alerts')
  @ApiSuccess({
    code: ApiCode.FINANCE_ALERT_LIST,
    message: 'Finance alerts fetched successfully',
  })
  @ApiOperation({ summary: 'List price alerts' })
  listAlerts(@CurrentUser() user: AuthUser) {
    return this.financeAlertService.list(user.id);
  }

  @Post('alerts')
  @ApiSuccess({
    code: ApiCode.FINANCE_ALERT_CREATED,
    message: 'Finance alert created successfully',
  })
  @ApiOperation({ summary: 'Create price alert (ABOVE/BELOW threshold)' })
  createAlert(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFinanceAlertDto,
  ) {
    return this.financeAlertService.create(user.id, dto);
  }

  @Patch('alerts/:id')
  @ApiSuccess({
    code: ApiCode.FINANCE_ALERT_UPDATED,
    message: 'Finance alert updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update price alert' })
  updateAlert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceAlertDto,
  ) {
    return this.financeAlertService.update(user.id, id, dto);
  }

  @Delete('alerts/:id')
  @ApiSuccess({
    code: ApiCode.FINANCE_ALERT_DELETED,
    message: 'Finance alert deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete price alert' })
  deleteAlert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.financeAlertService.remove(user.id, id);
  }
}
