import {
  BudgetEntryType,
  FinanceAlertCondition,
  FinanceMarket,
} from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { BudgetService } from '../../finance/budget.service';
import { WatchlistService } from '../../finance/watchlist.service';
import { FinanceAlertService } from '../../finance/finance-alert.service';
import { FinanceSearchService } from '../../finance/finance-search.service';

export type FinanceAgentAction = Record<string, unknown>;

export function createFinanceAgentTools(deps: {
  userId: string;
  budgetService: BudgetService;
  watchlistService: WatchlistService;
  financeAlertService: FinanceAlertService;
  financeSearchService: FinanceSearchService;
  actions: FinanceAgentAction[];
}) {
  const {
    userId,
    budgetService,
    watchlistService,
    financeAlertService,
    financeSearchService,
    actions,
  } = deps;

  const logExpense = tool(
    async (input) => {
      const entry = await budgetService.create(userId, {
        type: BudgetEntryType.EXPENSE,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        note: input.note,
        occurredAt: input.occurred_at,
      });
      actions.push({ type: 'BUDGET_EXPENSE_LOGGED', data: entry });
      return JSON.stringify({ ok: true, entry });
    },
    {
      name: 'log_expense',
      description: 'Log an expense (spending) to the user budget.',
      schema: z.object({
        category: z.string(),
        amount: z.number().positive(),
        currency: z.string().optional(),
        note: z.string().optional(),
        occurred_at: z.string().optional(),
      }),
    },
  );

  const logIncome = tool(
    async (input) => {
      const entry = await budgetService.create(userId, {
        type: BudgetEntryType.INCOME,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        note: input.note,
        occurredAt: input.occurred_at,
      });
      actions.push({ type: 'BUDGET_INCOME_LOGGED', data: entry });
      return JSON.stringify({ ok: true, entry });
    },
    {
      name: 'log_income',
      description: 'Log income to the user budget.',
      schema: z.object({
        category: z.string(),
        amount: z.number().positive(),
        currency: z.string().optional(),
        note: z.string().optional(),
        occurred_at: z.string().optional(),
      }),
    },
  );

  const listBudget = tool(
    async (input) => {
      const entries = await budgetService.list(userId, input.take ?? 40);
      return JSON.stringify({ ok: true, entries });
    },
    {
      name: 'list_budget',
      description: 'List recent budget entries.',
      schema: z.object({
        take: z.number().int().positive().max(100).optional(),
      }),
    },
  );

  const budgetSummary = tool(
    async (input) => {
      const summary = await budgetService.summary(
        userId,
        input.from ? new Date(input.from) : undefined,
        input.to ? new Date(input.to) : undefined,
      );
      return JSON.stringify({ ok: true, summary });
    },
    {
      name: 'budget_summary',
      description: 'Income/expense totals and by-category summary.',
      schema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
  );

  const searchMarket = tool(
    async (input) => {
      const result = await financeSearchService.searchMarket(input.query);
      actions.push({
        type: 'FINANCE_MARKET_SEARCH',
        data: {
          query: input.query,
          ok: result.ok,
          sourceCount: result.sources.length,
        },
      });
      return JSON.stringify(result);
    },
    {
      name: 'search_market',
      description:
        'Live web search for market rates, stock/index prices, FX, ADX, headlines, and highlights WITH source links. Use whenever the user asks for live/current market info. Chat-only — never background.',
      schema: z.object({
        query: z
          .string()
          .describe(
            'What to look up, e.g. "today stock market highlights with sources" or "FAB.AD live price"',
          ),
      }),
    },
  );

  const getQuote = tool(
    async (input) => {
      const result = await financeSearchService.getQuote(input.symbol);
      actions.push({
        type: 'FINANCE_QUOTE',
        data: { symbol: input.symbol, ok: result.ok },
      });
      return JSON.stringify(result);
    },
    {
      name: 'get_quote',
      description:
        'Live web lookup for a single stock/index/FX symbol price with sources.',
      schema: z.object({
        symbol: z.string().describe('Ticker e.g. FAB.AD, AAPL, XAUUSD'),
      }),
    },
  );

  const getMarketNews = tool(
    async (input) => {
      const result = await financeSearchService.getNews(input.query);
      actions.push({
        type: 'FINANCE_NEWS',
        data: { query: input.query, ok: result.ok },
      });
      return JSON.stringify(result);
    },
    {
      name: 'get_market_news',
      description:
        'Live web search for market/stock news headlines with source URLs.',
      schema: z.object({
        query: z.string(),
      }),
    },
  );

  const addWatchlist = tool(
    async (input) => {
      const item = await watchlistService.add(userId, {
        symbol: input.symbol,
        market:
          input.market?.toUpperCase() === 'ADX'
            ? FinanceMarket.ADX
            : input.market
              ? FinanceMarket.OTHER
              : undefined,
        displayName: input.display_name,
        notes: input.notes,
      });
      actions.push({ type: 'WATCHLIST_ADDED', data: item });
      return JSON.stringify({ ok: true, item });
    },
    {
      name: 'add_watchlist',
      description:
        'Add a symbol to the watchlist (storage). Use get_quote/search_market separately for live prices.',
      schema: z.object({
        symbol: z.string(),
        market: z.enum(['ADX', 'OTHER', 'adx', 'other']).optional(),
        display_name: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
  );

  const listWatchlist = tool(
    async () => {
      const items = await watchlistService.list(userId);
      return JSON.stringify({ ok: true, items });
    },
    {
      name: 'list_watchlist',
      description: 'List watchlist symbols.',
      schema: z.object({}),
    },
  );

  const removeWatchlist = tool(
    async (input) => {
      const result = await watchlistService.remove(userId, input.id);
      actions.push({ type: 'WATCHLIST_REMOVED', data: result });
      return JSON.stringify(result);
    },
    {
      name: 'remove_watchlist',
      description: 'Remove a watchlist item by id.',
      schema: z.object({ id: z.string() }),
    },
  );

  const createPriceAlert = tool(
    async (input) => {
      const alert = await financeAlertService.create(userId, {
        symbol: input.symbol,
        condition:
          input.condition.toUpperCase() === 'ABOVE'
            ? FinanceAlertCondition.ABOVE
            : FinanceAlertCondition.BELOW,
        threshold: input.threshold,
        currency: input.currency,
        watchlistItemId: input.watchlist_item_id,
      });
      actions.push({ type: 'FINANCE_ALERT_CREATED', data: alert });
      return JSON.stringify({
        ok: true,
        alert,
        note: 'Alert saved. No background polling — live prices only when you ask in chat.',
      });
    },
    {
      name: 'create_price_alert',
      description:
        'Store a price alert (no cron/polling; live checks only when user asks in chat).',
      schema: z.object({
        symbol: z.string(),
        condition: z.enum(['ABOVE', 'BELOW', 'above', 'below']),
        threshold: z.number(),
        currency: z.string().optional(),
        watchlist_item_id: z.string().optional(),
      }),
    },
  );

  const listPriceAlerts = tool(
    async () => {
      const alerts = await financeAlertService.list(userId);
      return JSON.stringify({ ok: true, alerts });
    },
    {
      name: 'list_price_alerts',
      description: 'List user price alerts.',
      schema: z.object({}),
    },
  );

  return [
    searchMarket,
    getQuote,
    getMarketNews,
    logExpense,
    logIncome,
    listBudget,
    budgetSummary,
    addWatchlist,
    listWatchlist,
    removeWatchlist,
    createPriceAlert,
    listPriceAlerts,
  ];
}
