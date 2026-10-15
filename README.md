# Minha Bolha

A small, open-source toy for your X network: sign in with X, pick a side, **Vermelho** (red) or **Verde** (green), and see which side the people you follow and who follow you picked. Compare your bubble with anyone's, watch it grow over time, and invite friends.

> **Not a poll or survey.** There is no sampling plan or scientific method; numbers only reflect people who chose to join, and say nothing about any wider population. It is a personal, non-commercial side project.

## Features

- **Your bubble:** who you follow and who follows you, colored by the side they picked
- **Compare** two bubbles side by side (`/c/<a>/<b>`)
- **Timeline** of how a bubble grew, and its size
- **Ranking** of the most closed and most mixed bubbles, and who invited the most people
- **Web push** when someone from your network joins or views your bubble (opt-in)
- **Share** a bubble on X, with a generated preview image or a short video

## Privacy (LGPD)

- Uses only public X profile data (id, handle, name, photo) and public follow lists.
- A side is stored only after explicit consent, is public and shown with the person's handle, and can be changed at any time.
- **Anyone can delete all their data** (account, choice, imported network, push subscriptions, view counts) at `/privacidade`.
- No data is sold or shared. Ads on the site receive no user data.
- Visit counts use a random anonymous cookie id.

See [`/privacidade`](src/app/privacidade/page.tsx) for the full text.

## Running locally

```bash
pnpm install
pnpm dev        # loads secrets from the macOS Keychain, uses ./local.db
```

Secrets live in the Keychain (service `x-eleicoes`), never in the repo: `pnpm secrets:set NAME`. See [`.env.example`](.env.example) for every variable.

### Importing follow lists

- **X API** (`X_FETCH_FOLLOWS=1`, OAuth 2.0 with `follows.read`): paid per account returned, capped by `X_FETCH_MAX`.
- **Apify** (`APIFY_FETCH_FOLLOWS=1`, `APIFY_TOKEN`): cheaper, runs in the background after sign-in, capped by `APIFY_FETCH_MAX`, skipped if fetched in the last `APIFY_REFRESH_DAYS`.

### Stack

Next.js (App Router, Cache Components), libSQL/Turso, d3-force, `next/og` for images, Web Push (VAPID), Vercel Cron and Analytics.

## License

[MIT](LICENSE)
