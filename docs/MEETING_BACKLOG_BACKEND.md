# ORBIT — Meeting Backlog (Backend)

**Created:** 2026-10-16  
**Purpose:** Long-running memory of post-meeting product points → backend work.  
**Rule:** Discuss and implement **one item at a time**. Do not start the next until the current is agreed/done.

---

## Agreed work order

| Order | Item | Meeting # | Status |
|------:|------|-----------|--------|
| **1** | **Contact Support / Customer Support** | 7 | `DONE` (v1 email form) |
| **2** | **Profile** (extend settings/preferences) | 7 + existing Profile API | `DONE` (preferences map) |
| **3** | Multilingual support | 1 | `PENDING` |
| **4** | International hotel booking platforms | 2 | `PENDING` |
| **5** | Discount coupons & travel offers | 3 | `PENDING` |
| **6** | Halal / Haram stock classification | 4 | `PENDING` |
| **7** | Investment insights (Bitcoin, gold, lithium) | 5 | `PENDING` |
| **8** | Health check (main page APIs) | 6 | `PENDING` |
| **9** | Settings (preferences API) | 7 | `PENDING` |
| **10** | Copyright / IP notices API | 8 | `PENDING` |
| **11** | Master prompt (global / multilingual) | 9 | `PENDING` |
| **12** | Comprehensive travel planning system (A–J) | 10 | `PENDING` |

Status values: `NEXT` | `IN_PROGRESS` | `DONE` | `PENDING` | `BLOCKED`

---

## Meeting source notes (verbatim intent)

### 1. Multilingual Support
Arabic, English, Urdu, French — accessibility and seamless worldwide UX.

### 2. International Hotel Booking Platforms
Integrate links to well-known international hotel booking platforms with competitive / affordable options.

### 3. Discount Coupons and Travel Offers
Discount coupons, promo codes, exclusive deals for hotels/flights. Partnerships with booking platforms, airlines, travel providers.

### 4. Global Stock Market — Halal / Haram
Screening platform for Sharia-compliant (Halal) vs non-compliant (Haram) stocks. Recognized Islamic financial principles + clear screening criteria explanations.

### 5. Investment Insights and Market Analysis
Realistic, data-driven insights for **Bitcoin, gold, lithium**: trends, price movements, risk, opportunities. Communicate uncertainties; **no guaranteed returns**.

### 6. Health Check on Main Page
Health-related assessments, basic health info, recommendations — accessible from main page.

### 7. Settings and Customer Support
Dedicated Settings + Customer Support at bottom of platform. Preferences, inquiries, contact support team.

### 8. Copyright and IP Protection
Copyright notices; protect branding/design/IP; respect third-party copyrights, licensing, attribution.

### 9. Clear Comprehensive Master Prompt
Flexible master prompt for diverse needs, cultures, languages; consistent, accurate, globally relevant results.

### 10. Comprehensive Travel Planning and Booking System
End-to-end trip: destination → return. Sub-features A–J below. Distinguish **estimated** vs **confirmed** prices; clearly mark **external booking redirects**.

#### 10A. Destination selection & recommendations
Interests, dates, budget, weather, purpose; family / adventure / relaxation / culture / shopping / business.

#### 10B. Travel budget planning
Total budget, spending limits, cost breakdown (flights, stay, transport, food, activities), alternatives for value.

#### 10C. Flight & ticket bookings
Links to international flight platforms; compare price, airline, duration, stops, baggage, flexibility; promos when possible.

#### 10D. Hotel & accommodation
Reputable OTAs; compare location, price, ratings, amenities, traveler type; coupons when possible.

#### 10E. Local transportation & transfers
Airport transfers, taxi, public transit, car rental, trains, buses; costs, duration, routes; booking links where supported.

#### 10F. Personalized tourist guide
Attractions, hidden gems, restaurants, shopping, culture, family, events; map/hours/fees/tips; daily itineraries.

#### 10G. Multiple travel plans / itineraries
Budget / balanced / premium / family / adventure / relaxation; costs + differences; customize/compare/combine; weekend / short / extended.

#### 10H. Complete trip management
Central dashboard: flights, hotels, transport, activities, schedule, refs, reminders; planned vs actual spend; confirmations/alerts when possible.

#### 10I. Travel savings & special offers
Coupons, seasonal deals, packages; cost-effective combos; disclose terms, fees, validity.

#### 10J. Smart travel assistant
AI plan/optimize/manage; alternatives; cost-cut tips; languages AR/EN/UR/FR; personalize by prefs/budget/dates/accessibility.

### Overall objective
Comprehensive, globally accessible, user-friendly, financially practical: travel + investment insights + health + multilingual + customer assistance in one experience.

---

## Backend task breakdown

### Order 1 — Contact Support (START HERE)
**Scope (agreed 2026-10-16):** simple form → email admin (no ticket DB for now).

- [x] `POST /api/support/contact` — body: `email`, `subject`, `description`
- [x] Brevo SMTP email to `SUPPORT_ADMIN_EMAIL` (Reply-To = user email)
- [x] Swagger tag `Support` + api code `SUPPORT_CONTACT_SENT`
- [x] Smoke test — API 201, Brevo queued to admin
- [ ] Later (optional): ticket DB / FAQ / admin reply thread

### Order 2 — Profile
- [x] Review existing `GET/PUT /api/profile`
- [x] Preferences: category → multiple values (`GET/PUT /api/profile/preferences`, per-category PUT/POST/DELETE)
- [x] Included `preferences` on `GET /api/profile`
- [x] Avatar + basic fields already present
- [ ] Later: notification / settings prefs if product wants separate Settings API (#9)

### Order 3 — Multilingual (#1)
- [ ] `preferredLanguage`: `en` | `ar` | `ur` | `fr` on profile
- [ ] Pass language into Main + domain agent prompts
- [ ] Optional `language` on `POST /api/chat` / `Accept-Language`
- [ ] Agents must reply in user language

### Order 4 — Hotel platforms (#2)
- [ ] Harden Travel hotel search toward major OTAs (Booking, Agoda, Hotels.com, Expedia, …)
- [ ] Normalize offer: `provider`, `url`, `priceEstimate`, `currency`, `external: true`
- [ ] Prompt: never claim in-app booking

### Order 5 — Coupons & offers (#3)
- [ ] Coupon/deal model + chat tool `search_travel_deals`
- [ ] Fields: code, terms, expiry, source URL, estimate vs confirmed
- [ ] Seed/admin path for partner deals later

### Order 6 — Halal / Haram (#4)
- [ ] Finance tool `screen_sharia_stock(symbol)` (chat-only)
- [ ] Response: `HALAL | HARAM | MIXED | UNKNOWN` + criteria + sources
- [ ] Disclaimers: not a fatwa; cite methodology
- [ ] Optional screening history

### Order 7 — BTC / gold / lithium (#5)
- [ ] Finance tool `analyze_asset({ asset })`
- [ ] Trends, risk, uncertainty, sources; **no return guarantees**
- [ ] Chat-only (no cron loops)

### Order 8 — Health check (#6)
- [ ] Define assessment contract (questions / score / tips)
- [ ] Models + `POST/GET` health-check APIs
- [ ] Health agent can interpret results in chat
- [ ] Main-page UI = frontend

### Order 9 — Settings (#7 remainder)
- [ ] `GET/PUT /api/settings` (language, currency, notifications, privacy)
- [ ] May merge with Profile if product prefers one surface — decide when we reach this item

### Order 10 — Copyright (#8)
- [ ] `GET /api/legal/copyright` (or static config)
- [ ] Attribution helpers for third-party travel/finance links
- [ ] Footer/UI = frontend

### Order 11 — Master prompt (#9)
- [ ] Shared ORBIT master policy module (safety, language, disclaimers, no fake prices/bookings)
- [ ] Rewrite Main + domain prompts for global / cultural / multilingual use
- [ ] Router aware of new capabilities

### Order 12 — Full travel system (#10 A–J)
- [ ] **A** Destination recommend tool + prefs
- [ ] **B** Trip budget breakdown model + estimate tool
- [ ] **C** Flight search/compare + external links + deals
- [ ] **D** Hotel compare (ties to #2/#3)
- [ ] **E** Local transport tool + links/estimates
- [ ] **F** Tourist guide + day itineraries
- [ ] **G** Multi-plan generator (budget/balanced/premium/…)
- [ ] **H** Expand Trip dashboard (refs, schedule, spend vs budget, reminders)
- [ ] **I** Savings/deals (ties to #3)
- [ ] **J** Travel assistant upgrades (multilingual, replan, cost-cut)

---

## Already in backend (do not rebuild blindly)

| Area | Notes |
|------|--------|
| Chat-first Main → Health / Travel / Finance / Productivity / Business | Live |
| Travel hotel/flight web search + prefs + trips | Partial |
| Finance budget / watchlist / alerts + chat market search | Partial; no Halal |
| Profile GET/PUT + avatar | Live; extend for language/settings |
| Brevo OTP email | Live (SMTP) |
| Support Centre | **Not built** — first build item |
| Multilingual | Not started |
| Health check product API | Not started |

---

## Hard constraints (keep forever)

- OpenAI **only** inside `POST /api/chat` (no finance/travel crons with OpenAI)
- No fake prices, bookings, or source URLs
- Travel: **estimate vs confirmed**; mark **external redirects**
- Finance insights: **not investment advice**; no guaranteed returns
- Halal screen: principles + sources; not a religious ruling guarantee

---

## Session log

| Date | What |
|------|------|
| 2026-10-16 | Document created. Work order: Support → Profile → rest. |
| 2026-10-16 | Contact Support v1: `POST /api/support/contact` → Brevo → admin. Next: Profile. |
| 2026-10-16 | Profile preferences map API (multi values per category). Next backlog item: Multilingual. |

---

## How to use this file

1. Open this doc at the start of each session.
2. Pick the `NEXT` / `IN_PROGRESS` row only.
3. Update checkboxes + status when done.
4. Append a line to **Session log**.
5. Mirror copies live in agent stores for chat memory (same filename).
