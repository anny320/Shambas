# Data sources to obtain

What the scoring engine consumes, where each signal can come from, and what
you actually have to go and get. Ordered by how easily you can get it.

Everything below is currently **simulated** by the mock adapters. The app runs
end to end without any of it. This document is the shopping list for making it
real.

A note on what "regional norm" means, because two of the most important
features depend on it. `ndviVsRegionalNorm` and `rainfallVsNormRatio` compare
this farm against what is normal *for its area*. That comparison is what lets
the model say a farm is doing well for where it sits, rather than well in
absolute terms. Norms are derived from the same sources over a wider area or a
longer period, so getting the source usually gets you the norm too.

---

## 1. Weather and rainfall — get this first

**Why first:** no API key, no account, no partnership, no cost. One HTTP call
per farm. It is the only source you can turn on this week.

| Feature the model needs | Where it comes from |
| --- | --- |
| `seasonRainfallMm` | Sum daily precipitation over the growing season |
| `rainfallVsNormRatio` | That season against the long-run mean for the same location |
| `rainfallReliability` | Spread of seasonal totals across the historical record |
| `longestDrySpellDays` | Longest run of days under a rainfall threshold |
| `droughtSeasonsLast5` / `floodSeasonsLast5` | Seasons far below or above the local norm |
| `seasonsOfHistory` | How many seasons the record covers |

### Open-Meteo — recommended

The **Historical Weather API** (`archive-api.open-meteo.com`) returns daily
precipitation for any latitude and longitude, going back decades. That single
endpoint supplies **every** feature in the table above: the current season from
recent days, and the norm, the reliability and the drought counts from the
historical record.

- **What to get:** nothing. No registration, no key.
- **Terms:** free for non-commercial use. A commercial pilot needs their paid
  tier. Check their current licence before charging an institution.
- **Watch for:** it is a reanalysis model, not a rain gauge. Good enough for
  risk banding, not for settling a parametric insurance payout.

### CHIRPS — the cross-check

Climate Hazards Center rainfall for Africa, 1981 to present, about 5 km, daily
and monthly. Public domain, no licence obstacle at all.

- **What to get:** GeoTIFF or NetCDF downloads from the Climate Hazards Center,
  or via Digital Earth Africa or the AWS open data registry.
- **Why bother, given Open-Meteo:** it is the reference the region's
  agricultural risk work is built on, it is genuinely public domain so a
  commercial product can use it, and it lets you validate Open-Meteo rather
  than trusting it.
- **Cost of using it:** these are large raster files. Using them means storing
  and querying rasters, which is real infrastructure, not an HTTP call.

---

## 2. Satellite vegetation — the differentiator, and harder

**Why it matters:** it is the only signal a farmer cannot overstate on a form.
It is what separates this from a questionnaire.

| Feature the model needs | Where it comes from |
| --- | --- |
| `ndviCurrent` | Most recent cloud-free NDVI over the farm |
| `ndviSeasonMean` | Mean NDVI across the growing season |
| `ndviYearOnYearRatio` | This season against the same season last year |
| `ndviVsRegionalNorm` | This farm against surrounding cropland |
| `observationCount` | Usable satellite passes behind those numbers |
| `cloudObscuredShare` | Share of passes lost to cloud |

Sentinel-2 gives 10 m resolution on roughly a five-day revisit, which is the
right instrument. Pick **one** of these routes to it.

### Copernicus Data Space Ecosystem

The official source. Register for a free account and create OAuth client
credentials. Its statistical and processing APIs can return an NDVI time series
for a point or polygon directly, which is exactly the shape needed here.

- **What to get:** a free account, then a client ID and secret.
- **Watch for:** free tier quotas on requests and processing units.

### Digital Earth Africa

Analysis-ready Sentinel-2 for Africa, already cloud-masked, with a free
sandbox and Python notebooks. Built for precisely this continent and use case,
and the PRD already names it as the intended integration platform.

- **What to get:** a free account for the sandbox or their STAC endpoint.
- **Why it may be the best fit:** cloud masking and scene assembly are the
  fiddly parts of NDVI, and this does them for you.

### Google Earth Engine

The most capable option, and the most setup. Free for research and
non-commercial use; commercial use has its own licensing.

- **What to get:** a Google Cloud project, Earth Engine enabled on it, and a
  service account key.
- **Watch for:** the non-commercial terms. A paying pilot may push you onto
  commercial licensing.

### Microsoft Planetary Computer

A free STAC catalogue of Sentinel-2. Worth knowing as a fallback.

**Whichever you pick, the real work is not the credential.** It is computing a
defensible NDVI: masking cloud and shadow, handling a farm too small for clean
pixels, and building the regional norm from surrounding cropland rather than
from a single point.

---

## 3. Crop and soil reference data — improves the numbers you already have

These do not add new signals. They replace hardcoded assumptions in the code
with real figures, which makes existing outputs defensible.

### HarvestStat Africa — replaces the regional crop norms

Subnational crop yield, area and production across 33 countries and 94 crops,
roughly 1980 to 2022. Openly published.

- **Replaces:** the five hardcoded agro-ecological zones in
  `src/adapters/regions.ts`. Right now a farm's regional norm comes from my
  approximation of its zone. This would make it a real county-level figure.

### iSDA Soil — enriches productivity

Africa-wide soil properties: pH, nitrogen, organic carbon, texture. CC-BY, so
attribution is required but commercial use is fine.

- **Adds:** soil quality context the model does not use yet. Would need a new
  feature and a new weight, so it is a model change, not just a data load.

### Kenyan input costs — replaces a guess in loan sizing

`INPUT_COST_PER_HA_KES` in `src/scoring/weights.ts` currently holds my
order-of-magnitude estimates per crop. These directly set the ceiling on every
recommended loan.

- **Best source:** your pilot institution's own input pricing, or current
  agro-dealer price lists. This is the single easiest real-world number to
  improve, and it changes every recommendation.

### ISRIC SoilGrids, RCMRD, Kenya open data

Optional further soil and administrative layers. Skip until the above are done.

---

## 4. Mobile money — needs a partnership, not a download

| Feature the model needs |
| --- |
| `monthsObserved`, `inflowRegularity`, `medianMonthlyInflowKes`, `inflowVolatility`, `averageBalanceKes`, `distinctCounterparties`, `priorRepaymentRate` |

**There is no public source for any of this, and there will not be.** It is
personal financial data.

Two routes exist:

1. **Safaricom Daraja.** Requires a commercial relationship with Safaricom and
   explicit, recorded consent from each farmer. The consent capture is already
   built; the partnership is not.
2. **The pilot institution's own records.** A SACCO or MFI already holds
   transaction and savings history for its members. Getting a consented export
   from a partner is far more achievable than a Safaricom integration, and it
   produces the same features.

Until one of those lands, this stays mocked. The model is built for that:
missing financial data lowers confidence and caps the offer rather than
silently assuming the worst or the best.

---

## 5. Repayment outcomes — the one that matters most

**This is the data that turns the expert model into a trained one.** Without
it, the weights stay as documented judgements rather than findings.

There is no public source. It comes from one place: a lending institution's
own history of who repaid and who did not.

Two things to ask a pilot partner for:

1. **Historical outcomes**, to calibrate the current weights against real
   defaults before going live.
2. **Ongoing outcomes**, captured per loan as the pilot runs. This is the P1
   repayment-capture feature and the beginning of the data flywheel.

Getting a few hundred historical records with outcomes would do more for the
product's credibility than every other source on this list combined.

---

## Suggested order

1. **Open-Meteo.** Free, immediate, replaces a whole mocked signal.
2. **Input costs** from a real price list. One afternoon, and it makes every
   loan recommendation defensible.
3. **A Sentinel-2 credential**, via Digital Earth Africa or Copernicus.
4. **HarvestStat**, to replace the hardcoded zones with real norms.
5. **A pilot institution**, for repayment history and consented financial data.
   Nothing on this list substitutes for it.

## Licensing, before any commercial launch

Each source carries its own terms and they differ in ways that matter once
money changes hands. CHIRPS is public domain. iSDA is CC-BY and needs
attribution. Open-Meteo's free tier is non-commercial. Copernicus and Earth
Engine have their own conditions. Record the licence and required attribution
per source as you adopt it, rather than auditing it later under pressure.
