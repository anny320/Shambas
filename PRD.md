# PRD — Shamba Score

**AI credit & insurance scoring for smallholder farmers.**
Working name · v0.2 · build target: Claude Code MVP · (v0.2 adds Appendix A — Data Sources)

> **On scope.** This PRD deliberately specs the *narrow, buildable, defensible* slice of a very large idea: an **AI risk-scoring engine that lenders, agri-input dealers and insurers use to extend credit and insurance to smallholder farmers**. Shamba Score is a B2B decisioning tool, **not** a licensed lender and **not** a farmer-facing consumer app in v1. That single scoping choice is what makes it buildable solo and keeps the hardest regulation on the licensed institutions who are the customers, not on us. ("Shamba" = farm; rename freely.)

---

## 1. Overview

Smallholder farmers can't get credit or insurance because they have no formal credit history or collateral, so lenders treat them as unscoreable and stay away. Shamba Score builds a **dynamic risk profile from alternative data** — satellite imagery of the farm, weather history, mobile-money patterns and agronomic data — and returns a credit score, a default-probability estimate, a recommended loan size/term, and a plain-language explanation. The paying customer is the **institution** (microfinance lender, SACCO, agri-input supplier, insurer), which monetises the *transaction* it can now safely make — not the farmer, who won't pay for information.

Proven model, for reference, not to copy: Apollo Agriculture reached hundreds of thousands of smallholders in Kenya/Zambia with AI-scored credit while holding repayment above ~90%. The finance gap Shamba Score sells into is estimated at roughly $65B across African smallholder agriculture.

---

## 2. Problem statement

Across Kenya, smallholders are ~70% of farmers and agriculture is ~a third of GDP, yet most farmers are locked out of formal credit and insurance because they lack the credit histories, payslips and collateral that traditional underwriting requires. Lenders that *would* serve them can't assess them affordably or fast enough, so capital doesn't flow and farmers under-invest in inputs — depressing yields in a sector already squeezed by climate and rising input costs. The cost of not solving it is a self-perpetuating gap: value-creating farmers stay uncreditworthy on paper, and lenders leave a large, profitable market unserved.

---

## 3. Goals

1. **Make an unscoreable farmer scoreable in minutes.** Produce a credit decision (score + recommended terms + explanation) from alternative data in under 2 minutes per applicant, versus days for manual assessment.
2. **Let a lending institution safely say yes more often.** Enable a pilot institution to approve a measurably higher share of smallholder applications while holding repayment at or above their current portfolio rate.
3. **Be explainable enough to underwrite on.** Every score ships with the top factors that drove it, so a loan officer (and a regulator) can trust and defend the decision.
4. **Prove the transaction model.** Land one paying pilot institution and demonstrate the per-assessment / revenue-share economics on real applications.
5. **Build a data flywheel.** Capture repayment outcomes so the model improves with every loan cycle.

---

## 4. Non-goals (v1)

1. **We do not lend money or hold risk.** No balance sheet, no licence as a credit provider — we provide the decisioning layer to licensed institutions. *(Regulatory and capital burden; separate, later initiative.)*
2. **No farmer-facing consumer app.** The v1 user is the institution's loan officer, not the farmer. *(The farmer won't pay; the institution will. Farmer self-application is P2.)*
3. **No proprietary satellite or weather infrastructure.** We consume third-party data via APIs. *(Reinventing this is out of scope and unnecessary.)*
4. **No full machine-learning model at launch.** v1 uses a transparent, expert-weighted scoring model; the ML model comes once real repayment data exists (see §8). *(Cold-start: we have no labelled defaults yet.)*
5. **No multi-country support in v1.** Kenya first, one data-adapter set. *(Prove one market before generalising.)*

---

## 5. Target users & personas

- **Primary — Loan Officer (at an MFI / SACCO / agri-lender).** The economic user. Reviews farmer applications, needs a fast, defensible decision. *This is who the UI is built for.*
- **Buyer — Institution Head of Credit / Product.** Signs the contract; cares about portfolio repayment, approval volume, turnaround time, and audit/compliance.
- **Secondary — Agri-input dealer.** Wants to offer buy-now-pay-later on seed/fertiliser; needs a quick creditworthiness check at point of sale.
- **Secondary — Insurer / product officer.** Wants parametric weather-index pricing for smallholders (P1).
- **Beneficiary (not the buyer) — the Farmer.** Provides data with consent, receives the loan/insurance. Their experience matters for consent and data capture, but they are not the paying user in v1.

---

## 6. User stories

**Loan officer (primary)**
- As a loan officer, I want to enter a farmer's profile and farm location and get a credit score in minutes, so that I can decide without a multi-day manual assessment.
- As a loan officer, I want to see the top factors behind each score, so that I can explain and defend the decision to my supervisor and the applicant.
- As a loan officer, I want a recommended loan size and term, so that I don't have to size the loan by gut.
- As a loan officer, I want to record my final decision and the loan issued, so that outcomes are tracked against the score.
- As a loan officer, I want the tool to warn me when key data is missing or low-confidence, so that I don't over-trust a thin file.

**Head of credit (buyer)**
- As a head of credit, I want a portfolio view of scored vs. issued vs. repaid, so that I can see whether the tool is improving my book.
- As a head of credit, I want an audit trail of every decision and its inputs, so that I can satisfy internal and regulatory review.

**Agri-input dealer (secondary)**
- As an input dealer, I want a fast point-of-sale creditworthiness check, so that I can safely offer pay-later on inputs.

**Farmer (beneficiary)**
- As a farmer, I want to consent to my mobile-money and farm data being used and see what's collected, so that I trust the process and my rights are respected.

---

## 7. Requirements

### Must-Have — P0 (the MVP cannot ship without these)

1. **Institution auth & multi-tenant accounts.** Each institution's users log in; data is isolated per institution.
   - [ ] A user can log in and only see their institution's applications and portfolio.
2. **Farmer application intake.** Capture farmer profile, farm geolocation (map pin / GPS), crop type, farm size, and explicit data-use consent.
   - Given a loan officer starts a new application, When they submit profile + farm location + consent, Then the application is saved and queued for scoring.
   - [ ] Consent is explicit, timestamped, and stored.
3. **Alternative-data ingestion adapters** for: (a) satellite vegetation index (e.g. NDVI over the farm boundary), (b) weather/rainfall history for the location, (c) mobile-money transaction summary (with consent). Each adapter behind a clean interface with a **mock implementation** so the app runs end-to-end before live API keys exist.
   - [ ] Each data source returns a normalised feature set or a clear "unavailable / low-confidence" flag.
4. **Scoring engine** producing: a credit score, a default-probability band, a recommended loan size and term, and a confidence level. v1 = transparent expert-weighted model (documented weights), not a black box.
   - Given an application with sufficient data, When scoring runs, Then a score, risk band, recommended terms, and confidence are returned in under ~2 minutes.
   - [ ] Missing/low-confidence data lowers confidence and is surfaced, never silently imputed as positive.
5. **Explainability panel.** Show the top factors (positive and negative) that drove the score.
   - [ ] Every score displays at least the top 3 contributing factors in plain language.
6. **Decision recording & portfolio list.** Loan officer records approve/decline and (if approved) loan details; a portfolio view lists applications with status.
   - [ ] Every decision is stored with its input snapshot and timestamp (audit trail).

### Nice-to-Have — P1 (fast follow)

1. **Repayment outcome capture** — record on-time / late / default per loan, structured to train the future ML model.
2. **Parametric weather-index insurance recommendation** — a premium/trigger suggestion from the weather adapter.
3. **Batch scoring / CSV import** for institutions with existing applicant lists.
4. **Farmer SMS/USSD notifications** (decision, reminders) via an SMS gateway.
5. **Model-performance dashboard** — approval rate, average turnaround, repayment vs. predicted.

### Future Considerations — P2 (design for, don't build)

1. **ML risk model** trained on accumulated repayment data, replacing/augmenting the expert model.
2. **Farmer self-application via USSD/app** (offline-friendly, low-bandwidth).
3. **Multi-lender marketplace** matching a farmer to the best-fit institution.
4. **Input-supplier BNPL integration** at point of sale.
5. **Multi-country data adapters.**

*(Design the data-adapter interface and the scoring interface as pluggable now, so P2 items don't require a rewrite.)*

---

## 8. Scoring model approach (the cold-start plan)

The honest constraint: at launch there is **no labelled repayment dataset**, so a trained ML model is impossible on day one. v1 therefore uses a **transparent, expert-weighted scoring model**:

- Features from three signal families: **farm productivity** (satellite vegetation trend vs. regional norm, farm size, crop), **climate risk** (rainfall reliability, drought/flood exposure for the location), and **financial behaviour** (mobile-money inflow regularity, balances, existing repayment signals where available).
- Each feature is normalised and combined with **documented, tunable weights** into a score and a default-probability band, with a confidence level driven by data completeness.
- Every loan outcome is captured (P1) to build the dataset that lets a **real ML model** (P2) replace the expert weights once there's enough signal.
- **Fairness guardrail:** monitor that the model isn't systematically excluding a region, gender, or crop type; low data ≠ high risk by default.

The fastest way to bootstrap credibility is a **pilot partner who shares historical repayment records**, letting the expert weights be calibrated against real outcomes before going live.

---

## 9. Data & integrations

| Signal | Source (examples) | Notes / dependencies |
|---|---|---|
| Satellite vegetation (NDVI) | Sentinel-2 via Sentinel Hub / open EO APIs | Needs API key + farm boundary; start mocked |
| Weather & rainfall history | Open weather / climate APIs | Location-keyed; start mocked |
| Mobile-money behaviour | M-Pesa (Safaricom Daraja API) | **Requires farmer consent + partnership**; start mocked |
| Agronomic / farm profile | Manual entry (v1) | Loan-officer captured |
| Repayment outcomes | Institution's records / our capture (P1) | The data flywheel |

**Compliance to design in from day one:** Kenya's Data Protection Act (2019) governs the personal and financial data — build consent, purpose-limitation, and data-subject rights into the intake. Digital-credit regulation (CBK) primarily binds the *lender*; position Shamba Score as a B2B technology provider and get this confirmed legally (see Open Questions).

---

## 10. Architecture & tech stack (Claude Code-friendly)

Chosen so a solo founder can build fast with Claude Code, deploy cheaply, and swap mocks for real APIs later:

- **Frontend:** Next.js (React) + TypeScript + Tailwind — the loan-officer dashboard.
- **Backend/API:** Next.js API routes (or a small FastAPI service if the scoring logic grows).
- **Scoring service:** start in TypeScript or Python as a pure, well-tested function `score(features) -> {score, pd, terms, confidence, factors}` — isolated so it's easy to test and later replace with an ML model.
- **Data layer:** Postgres via Supabase (auth + multi-tenant + storage in one).
- **Data adapters:** an `interface DataAdapter` with `MockAdapter` and `LiveAdapter` implementations per source, selected by env var — so the whole app runs demoable **without** live keys, then flips to live per source.
- **Deploy:** Vercel (web/api) + Supabase (db/auth). Low cost, fast.

---

## 11. Claude Code build plan (phased)

Build in this order — each phase is demoable on its own, and mocks let you finish the app before any external API access exists.

1. **Scaffold & auth.** Next.js + Tailwind + Supabase auth, multi-tenant institution accounts, empty dashboard shell. *Prompt Claude Code to set up the repo, env config, and a login + tenant model first.*
2. **Data model & intake.** Postgres schema (institutions, users, farmers, applications, decisions, outcomes); the farmer-application intake form with map pin and consent capture.
3. **Adapter interface + mocks.** Define `DataAdapter`; implement `MockAdapter`s that return realistic satellite/weather/mobile-money feature sets so scoring can be built and demoed end-to-end.
4. **Scoring engine.** The pure `score()` function with documented expert weights, confidence handling, and unit tests; wire it to applications.
5. **Explainability + decision + portfolio.** Factor breakdown panel, approve/decline recording with input snapshot, portfolio list view.
6. **Swap in one live adapter.** Replace a single mock (weather is easiest — no consent needed) with a real API to prove the live path.
7. **P1 as capacity allows:** repayment capture, insurance rec, batch import, SMS.

Keep a `CLAUDE.md` in the repo stating the scope guardrails (B2B only, no lending, adapters must stay pluggable, DPA consent mandatory) so Claude Code holds the line on scope across sessions.

---

## 12. Success metrics

**Leading (days–weeks):**
- Time-to-decision per application (target: under 2 minutes vs. days manually).
- Applications scored during the pilot (target: a set volume with the pilot institution).
- Loan-officer activation: share of pilot officers who score ≥10 real applications.

**Lagging (weeks–months):**
- Repayment rate on Shamba-scored loans (target: at or above the institution's existing portfolio rate; north star ≈ 90%+).
- Approval-rate lift for smallholders vs. the institution's baseline, at equal-or-better repayment.
- Value of loans facilitated (the base for revenue-share economics).
- Pilot → paying conversion (target: 1 paying institution).

---

## 13. Risks & assumptions

- **Cold start (highest).** No labelled defaults at launch → mitigated by the expert-weighted model + a pilot partner's historical data. *Assumption: at least one institution will share history.*
- **Data access & consent.** Mobile-money data needs Daraja access and farmer consent; satellite needs API keys. *Mitigation: mock-first architecture so the product exists before partnerships close.*
- **Regulatory.** Credit provision is regulated; the B2B-tech-provider position must be legally confirmed. *Risk if we drift toward lending ourselves.*
- **Adverse selection / fraud.** Self-reported farm data can be gamed; satellite ground-truths some of it, but fraud controls will be needed.
- **Climate correlation.** Weather-index insurance concentrates correlated risk (a regional drought hits all at once) — price and reinsure carefully (P1 concern).
- **Model fairness.** Alternative data can encode bias; monitor for systematic exclusion.

---

## 14. Open questions

- **[Legal]** As a pure decisioning provider (not lender), do we fall under CBK Digital Credit Provider licensing, or only our clients? *Blocking before any live lending pilot.*
- **[Partnership/Data]** Which pilot institution will share historical repayment data to calibrate the expert model? *Blocking for model credibility.*
- **[Data]** M-Pesa Daraja access path and the farmer-consent flow that satisfies the DPA — what's the minimum viable consent UX? *Non-blocking for mock build; blocking for live.*
- **[Engineering]** Real-time scoring vs. nightly batch for institutions with large applicant lists? *Non-blocking; affects P1 batch design.*
- **[Business]** Pricing model to test first: per-assessment fee, SaaS tier, or % of facilitated loan? *Non-blocking for build; needed for the pilot contract.*

---

## 15. Timeline / phasing

- **Phase 1 (MVP, mock-data):** Build steps 1–5 above — a fully demoable B2B scoring dashboard running on mock adapters. This is the bootcamp-showable artifact and the pilot-pitch demo.
- **Phase 2 (one live adapter + pilot):** Swap in live weather (then satellite), sign one pilot institution, calibrate weights on their historical data.
- **Phase 3 (flywheel):** Repayment capture live, begin accumulating outcome data toward the P2 ML model; add insurance rec and batch scoring as the pilot demands.

---

## Appendix A — Data sources for V1

Every source below is classified by **how you get it**: **[Upload]** = downloadable dataset you can load now to seed the model and mocks; **[API]** = free live API you can wire in; **[Private]** = not public, must be mocked in V1 and obtained via partnership/consent later.

| Signal family | Source | What it provides | Access | V1 role |
|---|---|---|---|---|
| Farm productivity | **Sentinel-2** (via Google Earth Engine / Copernicus Data Space / USGS / NASA) | NDVI vegetation health, 10 m, ~5-day revisit | [API] free (non-commercial) | Live NDVI — mock first, wire later |
| Farm productivity | **Digital Earth Africa** | One-stop analysis-ready cube: Sentinel-2 + CHIRPS + iSDA, with Python notebooks | [API] free | Primary integration platform |
| Climate risk | **CHIRPS** (Climate Hazards Center; mirrored on Digital Earth Africa / AWS) | Africa rainfall 1981–present, ~5 km, daily & monthly; public domain | [Upload] GeoTIFF + [API] | Uploadable rainfall history + regional norms |
| Climate risk | **Open-Meteo** | High-resolution live weather, **no API key** (non-commercial) | [API] free, no key | **First live adapter** (easiest) |
| Climate risk | **NASA POWER** | Solar and meteorological variables | [API] free | Optional |
| Soil context | **iSDA soil** | Africa soil properties (pH, nitrogen, organic carbon, texture) | [Upload] CSV, CC-BY | Uploadable productivity enrichment |
| Soil context | **ISRIC SoilGrids / Soils4Africa** | Global & Africa soil profiles | [Upload] | Optional enrichment |
| Soil context | **RCMRD / Kenya open data** | Kenya soil shapefiles (physical/chemical) | [Upload] shapefile | Kenya-specific enrichment |
| Crop norms | **HarvestStat Africa** | Subnational yield / area / production; 33 countries, 94 crops, ~1980–2022 | [Upload] | Regional-norm baselines for the productivity score |
| Seed / synthetic | **SAGDA** (Synthetic Agriculture Data for Africa) | Generates realistic African climate, soil, yield, fertiliser data | [Upload] open-source Python lib | Seed the mock adapters + stress-test the model |
| Financial behaviour | **M-Pesa (Safaricom Daraja API)** | Mobile-money transaction behaviour | **[Private]** — consent + partnership | **Mock in V1**; live only with a pilot + consent |
| Repayment labels | **Pilot lender records** | Actual repayment / default outcomes (the model's target) | **[Private]** — partnership | Mock/synthetic in V1; real via pilot |

### Notes

- **The two private signals are the honest gaps.** Mobile-money behaviour and repayment outcomes are not publicly available anywhere. V1 mocks both; they become real only through a pilot institution and consented farmers. This is the cold-start reality, not a shortcut.
- **Seed data grounds the mocks.** Rather than invent numbers, the mock adapters draw realistic ranges from the [Upload] sources above (CHIRPS rainfall norms, iSDA soil, HarvestStat crop-yield norms) — optionally sampling a small seed CSV generated with SAGDA — so the demo behaves like real African farm data.
- **Licensing:** each source has its own terms (e.g. CHIRPS public domain, iSDA CC-BY, Sentinel/Copernicus terms, Open-Meteo non-commercial). Record the licence and attribution per source before any commercial launch.

### The V1 data recipe

1. **Seed** the mock adapters and calibrate the expert weights using the [Upload] datasets (iSDA soil, HarvestStat crop norms, CHIRPS rainfall history) plus SAGDA-generated records.
2. **First live adapter:** Open-Meteo (no key, no partnership).
3. **Next live adapter:** NDVI via Digital Earth Africa / Earth Engine.
4. **Keep mocked** until a pilot lands: M-Pesa behaviour (needs consent) and repayment labels (needs a lender's history).
