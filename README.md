# Bounce (MVP)

Bounce is a Chrome Extension that adds AI-powered friction when users try to visit distracting sites during a focus block.

## 1) High-level overview

Instead of hard-blocking distraction sites, Bounce redirects the user to a local bouncer page and asks them to justify access. The bouncer uses assignment context and an LLM decision to either:

- grant temporary access (5 minutes), or
- deny access and push the user back to assignment work.

The current MVP uses a demo "Connect with Canvas" flow that fetches mock assignments from the local server.

## 2) MVP scope (what is in / out)

### In scope

- Chrome Extension (Manifest V3) with:
  - Popup app (assignment selection + editable blacklist + focus start/stop)
  - Background service worker (dynamic redirect/allow rules)
  - Bouncer page (chat interface and decision flow)
- Demo Canvas connect flow with server-returned mock assignments
- Server-side Gemini proxy with API key loaded from environment variables
- Temporary domain whitelist for exactly 5 minutes when access is granted

### Out of scope (for now)

- Production-grade Canvas OAuth flow and live Canvas sync
- Multi-user auth and backend persistence
- Analytics dashboards and historical reporting
- Advanced prompt experimentation UI

## 3) Tech stack

- Extension app: React + TypeScript + Vite + Tailwind CSS
- Extension packaging: @crxjs/vite-plugin (MV3)
- State: chrome.storage.local + message passing
- AI proxy server: Node.js + Express
- Model target: gemini-2.5-flash (called from server)

## 4) Repository structure

- src/background.ts: background service worker, dynamic block/allow rules, alarm-based expiry
- src/popup/*: popup UI and focus-session controls
- src/bouncer/*: interception chat UI and grant/deny handling
- src/lib/*: shared storage, messaging, mock assignment helpers
- manifest.config.ts: extension manifest definition
- server/index.js: Gemini proxy endpoint
- server/.env.example: environment template

## 5) Installation

### Prerequisites

- Node.js 20+
- npm 10+
- Google Chrome

### Setup

1. Install dependencies:

   npm install

2. Create server environment file:

   cp server/.env.example server/.env

3. Set GEMINI_API_KEY in server/.env.

## 6) Running locally

Run server (terminal 1):

npm run dev:server

Build extension (terminal 2):

npm run build

Load extension in Chrome:

1. Open chrome://extensions
2. Enable Developer mode
3. Click Load unpacked
4. Select the dist folder

## 7) How to use MVP flow

1. Open the Bounce popup from the extension icon.
2. Click Connect with Canvas in the popup.
3. Wait for assignments to load from the server demo payload.
4. Select one or more assignments.
5. Add or edit blacklist domains.
6. Click Start Focus.
7. Visit a blocked domain (example: youtube.com).
8. Respond to the bouncer prompt:
   - If granted, the domain is temporarily allowed for 5 minutes.
   - If denied, the user remains blocked.

## 8) Dev scripts

- npm run dev: extension dev mode
- npm run dev:server: Express server with watch mode
- npm run build: TypeScript + Vite build
- npm run lint: ESLint checks

## 9) Team collaboration notes

- Codename is currently Bounce; naming may change.
- Keep API keys only in server/.env (never commit secrets).
- Commit only source files (dist can be regenerated).
- Keep UI minimal, clean, and scoped to MVP.

## 10) Known limitations

- Canvas assignment data is a server-side demo JSON object in `server/index.js` (`mockCanvasAssignmentsResponse`) and can be edited for demos.
- Current bouncer redirect restores access by domain (https://<domain>), not deep path.
- If server is down or key is missing, bouncer cannot grant access.
