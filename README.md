# BeeSweeper

BeeSweeper is a mobile-first Minesweeper-inspired arcade game on Base. Clear safe hive cells, avoid hidden bees, submit your score onchain, and view score proofs on Basescan.

Live app: https://beesweeper.vercel.app/

GitHub: https://github.com/0xkodoh/beesweeper

## Verified Contract

Base Mainnet contract: `0xd2A1b3D33A7Ebb1F2E877de2187574114DacDF24`

Basescan: https://basescan.org/address/0xd2A1b3D33A7Ebb1F2E877de2187574114DacDF24#code

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- wagmi + viem
- Reown AppKit / WalletConnect
- Supabase
- Hardhat
- Solidity
- Base Mainnet

## Features

- Playable BeeSweeper game with Easy, Medium, and Hard boards
- First-click safety so the first revealed cell is never a bee
- Score, timer, restart, and result states
- Background music and sound effects
- Base Mainnet wallet connection through Reown AppKit
- Onchain score submission to a verified Base contract
- Basescan proof links for submitted scores
- Supabase-backed leaderboard with difficulty tabs
- Wallet-contextual game history
- Local fallback for score display if API loading fails

## Local Setup

Install dependencies, configure environment variables, then run the app locally:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Create `.env.local` using `.env.example` as a starting point:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
SUPABASE_SERVICE_ROLE_KEY=
PRIVATE_KEY=
BASE_MAINNET_RPC_URL=
BASE_SEPOLIA_RPC_URL=
BASESCAN_API_KEY=
```

Server-only secrets such as `SUPABASE_SERVICE_ROLE_KEY` and `PRIVATE_KEY` must never be exposed with a `NEXT_PUBLIC_` prefix.

## Score Integrity

BeeSweeper is currently an MVP client-side onchain game. Score submissions use lightweight validation, including difficulty checks, score bounds, wallet-required submissions, duplicate submission blocking, and onchain proof links for submitted scores.

Scores are submitted to the verified Base Mainnet contract as events. Stronger server-signed score verification is planned for a future version so completed games can be validated before onchain submission with a higher level of integrity.

## Deployment Notes

- Deploy the frontend on Vercel.
- Configure Supabase environment variables in the Vercel project.
- Configure `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for Reown AppKit.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `PRIVATE_KEY`, RPC URLs, and `BASESCAN_API_KEY` server-side only.
- Use `npm run deploy:base` to deploy the score contract to Base Mainnet.
- Use `npm run verify:base` to verify the deployed contract on Basescan.
