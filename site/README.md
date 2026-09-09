# Landing page

A static marketing one-pager, deployed to GitHub Pages by
`.github/workflows/pages.yml` on any push to `main` that touches this
directory.

It is plain HTML with inline CSS and no build step, no JavaScript and no
external requests, so it loads fast on a slow connection and there is nothing
to keep up to date.

## The app is not deployed here

GitHub Pages serves static files only. Shamba Score needs a server for
authentication, the database and the scoring routes, so it deploys to Vercel
instead. This page links to the repository, not to a running instance.

## Turning it on

One manual step is needed once, and only the repository owner can do it:

1. Go to **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.

That is all. The workflow cannot do this for you: creating a Pages site
requires repository administration rights, and the `GITHUB_TOKEN` a workflow
runs with does not have them. Until it is done, every run fails at the
`configure-pages` step.

Once Pages is on, the page publishes at `https://anny320.github.io/Shambas/`.
Enabling it usually kicks off a deployment straight away; if not, run the
workflow by hand from the **Actions** tab.

Only the repository's **default branch** publishes. The workflow reads that
from the repository rather than hard-coding a branch name, so renaming the
default branch to `main` later will not break it. A push to any other branch
that touches `site/` is skipped rather than overwriting the live page.

## Editing it

Edit `index.html` directly. Keep the claims honest: the figures are published
sector estimates rather than measurements of this product, and the status
section should keep saying plainly that there is no pilot and no live data
source yet.
