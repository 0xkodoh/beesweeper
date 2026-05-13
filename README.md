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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Score Integrity

BeeSweeper is currently an MVP client-side onchain game. Score submissions are protected with lightweight validation, including difficulty checks, score bounds, wallet-required submissions, duplicate submission blocking, and onchain proof links for submitted scores.

Stronger server-signed score verification is planned for a future version so completed games can be validated before onchain submission with a higher level of integrity.

## Verified Contract

BeeSweeper score submissions use the verified Base Mainnet contract at `0xd2A1b3D33A7Ebb1F2E877de2187574114DacDF24`.

View the verified source on Basescan: [BeeSweeperScores](https://basescan.org/address/0xd2A1b3D33A7Ebb1F2E877de2187574114DacDF24#code)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
