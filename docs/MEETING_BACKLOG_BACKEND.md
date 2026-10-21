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
| **3** | Multilingual support | 1 | `SKIPPED` (for now) |
| **4** | International hotel booking platforms | 2 | `DONE` |
| **5** | Discount coupons & travel offers | 3 | `DONE` (web search A only) |
| **6** | Halal / Haram stock classification | 4 | `DONE` (web search A) |
| **7** | Investment insights (Bitcoin, gold, lithium) | 5 | `DONE` |
| **8** | Health check (main page APIs) | 6 | `DONE` |
| **9** | Settings (preferences API) | 7 | `SKIPPED` (for now) |
| **10** | Copyright / IP notices API | 8 | `SKIPPED` (for now) |
| **11** | Master prompt (global / multilingual) | 9 | `DONE` (shared policy) |
| **12** | Comprehensive travel planning system (A–J) | 10 | `DONE` |

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
- [x] Harden Travel hotel search toward major OTAs (Booking, Agoda, Hotels.com, Expedia, Kayak)
- [x] Normalize offer: `provider`, `url`, `priceEstimate`, `currency`, `external: true`
- [x] Prompt + tool disclaimer: never claim in-app booking; estimate vs external redirect

### Order 5 — Coupons & offers (#3)
- [x] Chat tool `search_travel_deals` (web search only — Layer A)
- [x] Fields: title, code, scope, terms, validUntil, sourceUrl, provider, estimatedSaving, external
- [x] Never invent codes; disclaimer to verify on partner site
- [ ] Later (Layer B): curated `TravelDeal` DB + partner seeds when available

### Order 6 — Halal / Haram (#4)
- [x] Finance tool `screen_sharia_stock(symbol)` (chat-only web search)
- [x] Response: `HALAL | HARAM | MIXED | UNKNOWN` + criteria + sources
- [x] No hallucination: unclear/no sources → UNKNOWN; not a fatwa disclaimer
- [ ] Later (optional): dedicated Sharia vendor API + screening history

### Order 7 — BTC / gold / lithium (#5)
- [x] Finance tool `analyze_asset({ asset })`
- [x] Trends, risk, uncertainty, sources; **no return guarantees**
- [x] Chat-only (no cron loops)

### Order 8 — Health check (#6)
- [x] Fixed wellness quiz v1 (questions / score / tips) — not a diagnosis
- [x] Model `HealthCheckResult` + APIs: questions, submit, latest, history
- [ ] Optional later: Health agent can interpret latest result in chat
- [ ] Main-page UI = frontend

### Order 9 — Settings (#7 remainder)
- [ ] `GET/PUT /api/settings` (language, currency, notifications, privacy)
- [ ] May merge with Profile if product prefers one surface — decide when we reach this item

### Order 10 — Copyright (#8)
- [ ] `GET /api/legal/copyright` (or static config)
- [ ] Attribution helpers for third-party travel/finance links
- [ ] Footer/UI = frontend

### Order 11 — Master prompt (#9)
- [x] Shared `orbit-master-policy.ts` (honesty, no inventing, disclaimers)
- [x] Wired into all domain agents via `withAttachmentSystemPrompt` + Health agent
- [x] Main router: classify only, no invented answers
- [ ] Later optional: multilingual reply policy when languages are enabled

### Order 12 — Full travel system (#10 A–J)
- [x] **A** `recommend_destinations`
- [x] **B** `estimate_travel_budget`
- [x] **C** `search_flights` (existing, kept)
- [x] **D** `search_hotels` + OTAs (existing, kept)
- [x] **E** `search_local_transport`
- [x] **F** `destination_guide`
- [x] **G** `generate_itinerary_options` + `save_trip_itinerary`
- [x] **H** Trip dashboard `get_trip` + `log_trip_expense` (+ purpose/itinerary/expenseLog on Trip)
- [x] **I** `search_travel_deals` (existing, kept)
- [x] **J** Travel agent prompt covers full planner flow + reminders/prefs

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
| 2026-10-19 | Pushed to GitHub main. Multilingual skipped for now. Next: International hotel booking platforms. |
| 2026-10-19 | Hotel OTAs hardened (provider/url/priceEstimate/external). Next: Discount coupons & travel offers. |
| 2026-10-19 | Travel deals Layer A: `search_travel_deals` chat web search. Next: Halal/Haram stocks. |
| 2026-10-19 | Sharia screen Layer A: `screen_sharia_stock`. Next: BTC/gold/lithium insights. |
| 2026-10-19 | BTC/gold/lithium skipped for later. Next: Health check (main page APIs). |
| 2026-10-19 | Health check APIs shipped. Next: Settings. |
| 2026-10-19 | Settings skipped for now. Next: Copyright / IP notices API. |
| 2026-10-19 | Copyright skipped for now. Next: Master prompt. |
| 2026-10-19 | Light master policy shipped; full travel A–J skipped (current travel OK). Meeting backlog largely complete. |
| 2026-10-19 | Full travel A–J planner tools + trip dashboard/expenses shipped. |
| 2026-10-19 | Asset insights `analyze_asset` (BTC/gold/lithium). |

---

## How to use this file

1. Open this doc at the start of each session.
2. Pick the `NEXT` / `IN_PROGRESS` row only.
3. Update checkboxes + status when done.
4. Append a line to **Session log**.
5. Mirror copies live in agent stores for chat memory (same filename).
