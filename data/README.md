# Data

Where the real-world datasets live. Everything the app does today runs on
simulated data, so this directory is empty apart from one editable reference
file. `docs/data-sources.md` explains what each source is and how to obtain it.

## Two ways to add a dataset

Both start by editing `sources.json`.

**By URL.** Fill in the `url` on an entry, then:

```bash
npm run data:fetch
```

It downloads to the path in `file`, streaming rather than buffering, so a
large raster will not exhaust memory. Already-present files are skipped; add
`--force` to replace one, or `--id=<id>` to do just one.

**By hand.** Leave `url` as `null` and put the file at the path in `file`
yourself. Plenty of these cannot be fetched by a script anyway: an export from
a pilot lender arrives by email, and some portals need a login.

Either way:

```bash
npm run data:status
```

tells you what is present, what is missing, and how big each file is.

## reference/ is committed, raw/ is not

**`reference/`** holds small files that belong in git, so everyone working on
the repo has the same numbers. Keep them well under a megabyte. `data:status`
warns if a committed file grows large enough to make cloning unpleasant.

**`raw/`** is gitignored entirely. Large rasters, licensed downloads and
anything confidential go here. The manifest records where each came from, so
the directory is reproducible without the files ever being committed.

**Never commit repayment outcomes or mobile-money exports.** They are personal
financial data about identifiable people. They are gitignored for that reason,
and `raw/` is where they belong.

## Adding a new entry

```json
{
  "id": "short-kebab-id",
  "name": "What a human calls it",
  "kind": "reference",
  "file": "reference/short-kebab-id.csv",
  "url": "https://example.org/thing.csv",
  "licence": "CC-BY, attribution required",
  "feeds": "which part of the code uses it",
  "notes": "anything the next person needs to know"
}
```

`file` must stay inside `data/`; the tooling refuses a path that escapes it.

Record the `licence` honestly as you add each one. The sources differ in ways
that matter once an institution is paying: CHIRPS is public domain, iSDA is
CC-BY, Open-Meteo's free tier is non-commercial. Auditing that later, under
pressure, is much worse than noting it now.

## The one worth doing today

`reference/input-costs-kes.csv` holds the cost of one cycle of inputs per
hectare for each crop. Those figures set the **ceiling on every loan the model
recommends**, and they are currently my own estimates.

Replace them with a real agro-dealer price list, or your pilot partner's own
pricing, and every recommendation the product makes becomes defensible. It is
the cheapest meaningful improvement available, and it needs no API, no
account and no partnership.

They are not yet wired into the scoring engine, which still reads
`INPUT_COST_PER_HA_KES` in `src/scoring/weights.ts`. Update the CSV with real
figures and ask for them to be connected, or copy them across by hand.
