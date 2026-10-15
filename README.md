This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Import X follow graph

The app can import the signed-in account's followers and following into `edges`
and `profiles`. Set `X_FETCH_FOLLOWS=1` and enable the `follows.read` OAuth 2.0
scope for the X app. On the next OAuth 2.0 sign-in, the importer follows API
pagination for both lists and saves each page as it arrives.

`X_FETCH_MAX` caps the number of followers and following accounts fetched per
sign-in (default `100` in each direction). Raise it to fetch more, up to the
account's full lists. `X_FETCH_PAGE_SIZE` controls page size (default `1000`, max
`1000`). X API reads are pay-per-use, so larger limits can increase costs. Each
account needs to sign in to import its own lists.

### Via Apify (cheaper, works with OAuth 1.0a)

Instead of the X API, the import can use the
[Xquik X Follower Scraper](https://apify.com/xquik/x-follower-scraper) actor on
Apify (~$0.00015 per account returned, no X login or `follows.read` scope).
Store the token with `pnpm secrets:set APIFY_TOKEN` and set
`APIFY_FETCH_FOLLOWS=1`. After each sign-in it scrapes up to `APIFY_FETCH_MAX`
(default `1000`) followers and following of the signed-in handle in the
background, so the login redirect is not delayed. Each run is capped at 240
seconds and has a spend cap set from `APIFY_FETCH_MAX`. Results are stored in `edges` and
`profiles`; a user fetched in the last `APIFY_REFRESH_DAYS` (default `30`) is not
fetched again on sign-in.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
