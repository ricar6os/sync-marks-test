# Bookmark Sync Monorepo

A production-oriented TypeScript monorepo for a Convex-backed bookmark sync product:

- `apps/web`: Next.js 16 App Router dashboard
- `apps/extension`: Vite + React 19 browser extension
- `convex`: Convex backend and Convex Auth configuration
- `packages/ui`: shared presentational components
- `packages/convex`: shared Convex client helpers, auth session manager, and bookmark helpers
- `packages/utils`: bookmark normalization, tree conversion, and sync utilities
- `packages/config`: shared Biome, TypeScript, and Tailwind v4 config assets

## Stack

- `pnpm` workspaces
- `turbo`
- strict TypeScript
- Biome
- Tailwind CSS v4
- Convex
- Convex Auth password provider

## Prerequisites

- Node.js 22+
- pnpm 10+
- A Convex account and deployment for full local backend execution

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`
- `CONVEX_SITE_URL`
- `JWT_PRIVATE_KEY`
- `VITE_CONVEX_URL`

Notes:

- `VITE_CONVEX_URL` is optional if it matches `NEXT_PUBLIC_CONVEX_URL`.
- `JWT_PRIVATE_KEY` must be an RSA private key for Convex Auth token signing.
- `apps/web` loads the workspace root `.env.local`, so local Convex values do not need to be duplicated inside `apps/web`.
- If `convex dev` writes `CONVEX_URL` into `.env.local`, the Next app reuses it automatically as `NEXT_PUBLIC_CONVEX_URL` during local development.

## Setup

```bash
pnpm install
```

## Development

Start the full local workflow:

```bash
pnpm dev
```

That runs:

- `convex dev`
- `next dev`
- extension watch build for Chromium

Important:

- `convex dev` is the step that configures the local Convex project if `CONVEX_DEPLOYMENT` is not already valid.
- This repository includes committed `convex/_generated/*` files so the TypeScript packages can build before a deployment is configured.
- Once your Convex deployment is configured, `pnpm run codegen` uses the real Convex generator.

## Production Build

```bash
pnpm build
pnpm lint
pnpm format
```

## Web App

The web app lives in `apps/web` and uses:

- `ConvexAuthNextjsServerProvider`
- Next proxy middleware for protected routes
- Convex reactive queries for the dashboard

Routes:

- `/`
- `/login`
- `/signup`
- `/dashboard`

The dashboard supports:

- real-time tree view
- search
- create bookmark
- create folder
- rename
- move
- soft delete
- logout

## Extension

The extension lives in `apps/extension` and ships two builds:

- `apps/extension/dist/chromium`
- `apps/extension/dist/firefox`

Architecture:

- `src/background`: sync coordinator and bookmark event listeners
- `src/popup`: popup UI
- `src/lib`: browser wrappers, storage, roots, env, and message types

### Loading the extension

Chrome / Edge:

1. Run `pnpm --filter @bookmark-sync/extension build:chromium`
2. Open the extensions page
3. Enable developer mode
4. Load unpacked from `apps/extension/dist/chromium`

Firefox:

1. Run `pnpm --filter @bookmark-sync/extension build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Load temporary add-on from `apps/extension/dist/firefox/manifest.json`

### Browser compatibility notes

- Chromium uses `background.service_worker`
- Firefox uses `background.scripts` with MV3 `browser_specific_settings`
- Bookmark root handling is normalized into logical roots so native top-level folder differences do not leak into Convex

## Auth Model

Convex Auth is the only auth system.

The repository uses the password provider with two execution models:

- Web:
  - Next proxy route handling via Convex Auth Next.js integration
  - session persisted via the web integration’s cookie flow
- Extension:
  - auth actions executed directly against Convex Auth
  - access token and refresh token stored in `chrome.storage.local` / `browser.storage.local`
  - session restored on popup and background startup without relying on cookies

Both clients authenticate against the same Convex Auth backend and resolve to the same Convex user identity.

## Bookmark Sync Model

Convex is the source of truth.

Schema highlights:

- `bookmarks` table
- soft delete with `deleted: true`
- `updatedAt` for LWW conflict resolution
- logical root folders persisted in Convex with `rootKey`

Conflict policy:

- last write wins by `updatedAt`
- equal timestamps resolve in favor of server state
- first attach on a browser with existing local and remote data uses a server-safe merge

Sync behavior:

- initial local upload when remote is empty
- remote subscription in the extension background worker
- debounced local bookmark event handling
- local browser ID to Convex ID mapping stored only in extension storage

## Workspace Layout

```text
apps/
  extension/
  web/
packages/
  config/
  convex/
  ui/
  utils/
convex/
```

## Notes

- There are no tests and no CI/CD in this repository by design.
- The root `pnpm build` command falls back to the committed Convex generated files when a deployment is not yet configured locally.
