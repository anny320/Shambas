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

Once the workflow has run, enable Pages in the repository settings under
**Settings → Pages**, with **Source** set to **GitHub Actions**. The page then
publishes at `https://anny320.github.io/Shambas/`.

## Editing it

Edit `index.html` directly. Keep the claims honest: the figures are published
sector estimates rather than measurements of this product, and the status
section should keep saying plainly that there is no pilot and no live data
source yet.
