# Focus Agent

Get Back on Track.

Focus Agent is a Chrome extension that applies AI-guided friction when users try to access distracting domains during a focus session. The current implementation uses a hybrid decision flow with policy scoring, retrieval context, LLM reasoning, and verifier guardrails.

## What the product does

- Focus session setup with assignment selection and editable domain blocklist
- Canvas demo connection (mock server payload)
- Persona-aware coaching (Strict, Supportive, Socratic, Custom)
- Bouncer interception with:
  - quick action plan generation
  - chat-based access justification
  - decision trace metadata (confidence, reason code, policy decision)
- YouTube research mode during approved access:
  - targeted redirect to recommended video or focused search
  - feed sanitization and Research Mode banner

## AI architecture (current)

For bouncer decisions, the server can run a feature-flagged orchestrator pipeline:

1. Signal extraction (deadline urgency, domain risk, rationale specificity, history)
2. Policy scoring (allow/deny/review prior + confidence)
3. Retrieval context lookup from mock academic resources
4. LLM decision generation (structured JSON)
5. Response verifier pass (schema normalization + guardrails)

When orchestrator is disabled, the system falls back to the legacy LLM-only decision endpoint behavior.

## Project structure

- src/popup/*: session controls, assignments, persona, blocklist
- src/bouncer/*: decision UI, action execution, decision trace, feedback capture
- src/background.ts: blocking rules, temporary allow lifecycle, sanitizer state
- src/content/youtubeSanitizer.ts: YouTube research mode filtering
- src/lib/*: shared storage/message helpers
- server/index.js: API routes and feature-flag wiring
- server/mockData.js: mock datasets, retrieval helper, telemetry store
- server/signalExtraction.js: intervention feature engineering
- server/policyScoring.js: policy prior scoring and thresholds
- server/orchestrator.js: policy + retrieval + LLM + verifier pipeline
- server/responseVerifier.js: final schema/policy safety normalization
- server/offlineEval.js: replay eval and threshold tuning

## Prerequisites

- Node.js 20+
- npm 10+
- Google Chrome

## Setup

1. Install dependencies:

   npm install

2. Create env file:

   cp server/.env.example server/.env

3. Configure server env values:

   GEMINI_API_KEY=your_key_here
   PORT=8787
   ENABLE_AI_ORCHESTRATOR=false
   ENABLE_RESPONSE_VERIFIER=true
   ENABLE_DECISION_TRACE_METADATA=true
   ENABLE_TELEMETRY_CAPTURE=false
   ENABLE_OFFLINE_EVAL=false

## Run locally

1. Start server:

   npm run dev:server

2. Build extension:

   npm run build

3. Load extension in Chrome:
   - Open chrome://extensions
   - Enable Developer mode
   - Click Load unpacked
   - Select dist/

4. After code changes:
   - npm run build
   - click Reload in chrome://extensions

## End-to-end walkthrough

1. Open popup and click Connect with Canvas.
2. Select assignments, persona, and blocked domains.
3. Start focus.
4. Open a blocked site.
5. On bouncer:
   - choose a quick action, or
   - explain rationale in chat
6. Review decision trace metadata (if enabled).
7. If granted, temporary access opens (YouTube gets research routing + sanitization).
8. Submit helpful/not helpful feedback in decision trace panel.

## Feature flags

- ENABLE_AI_ORCHESTRATOR
  - false: legacy LLM-only decision path
  - true: policy + retrieval + LLM + verifier orchestration path
- ENABLE_RESPONSE_VERIFIER
  - true: enforce final response normalization and policy guardrail checks
- ENABLE_DECISION_TRACE_METADATA
  - true: include confidence/reason/policy metadata in decision payload
- ENABLE_TELEMETRY_CAPTURE
  - true: persist intervention/outcome logs in mock telemetry store
- ENABLE_OFFLINE_EVAL
  - true: enable policy replay/tuning endpoints

## Mock APIs (development)

- GET /api/mock/bootstrap
- GET /api/mock/courses
- GET /api/mock/assignments
- GET /api/mock/resources
- GET /api/mock/domains
- GET /api/mock/profile
- GET /api/mock/history
- GET /api/mock/metrics-summary
- POST /api/mock/retrieve-context
- POST /api/mock/extract-signals
- POST /api/mock/policy-score
- POST /api/mock/orchestrate-decision
- GET/POST /api/mock/evaluate-policy (when ENABLE_OFFLINE_EVAL=true)
- POST /api/mock/log-intervention (active when ENABLE_TELEMETRY_CAPTURE=true)
- POST /api/mock/log-outcome (active when ENABLE_TELEMETRY_CAPTURE=true)
- GET /api/feature-flags

## Scripts

- npm run dev
- npm run dev:server
- npm run build
- npm run lint
- npm run preview

## Known limitations

- Canvas integration is still demo-only.
- Telemetry and offline eval are in-memory mock flows (non-persistent).
- Threshold tuning uses small mock samples and should not be treated as production calibration.
