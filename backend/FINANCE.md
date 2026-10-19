# ORBIT Finance Backend

Finance domain under the same chat: Main agent routes `FINANCE` → Finance sub-agent.

**Info-only:** no trade execution.

**Market data (quotes / ADX / news): REMOVED from OpenAI web search.**  
Will be wired later with a **dedicated market-data API key** — never via web search.

## REST (`/api/finance`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/budget` | List income/expense entries |
| `GET` | `/budget/summary` | Totals + by category (`?from=&to=`) |
| `POST` | `/budget` | Create income/expense |
| `DELETE` | `/budget/:id` | Delete entry |
| `GET/POST` | `/watchlist` | List / add symbol (storage only) |
| `DELETE` | `/watchlist/:id` | Remove |
| `GET/POST` | `/alerts` | List / create price alert (stored only) |
| `PATCH/DELETE` | `/alerts/:id` | Update / delete |

## Chat tools (Finance agent)

`log_expense`, `log_income`, `list_budget`, `budget_summary`, `add_watchlist`, `list_watchlist`, `remove_watchlist`, `create_price_alert`, `list_price_alerts`

**Removed:** `get_quote`, `get_market_news`, `research_market` (no web search for market data).

## Alerts → FCM

**Off.** Alerts can be saved; live threshold checks wait for the market-data vendor API.
