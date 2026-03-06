# Model Card — Focus Agent AI Component

## 1) Model Overview
Focus Agent uses a hybrid AI decision system in a Chrome extension + local server architecture.

The system combines:
- a hosted LLM (`gemini-2.5-flash`) for grounded language reasoning,
- deterministic signal extraction and policy scoring,
- retrieval over mock academic resources,
- a response verifier for schema and guardrail enforcement.

The product does not fine-tune its own base model. It uses prompt engineering, policy heuristics, and structured post-processing around an external model API.

Primary AI endpoints:
- `POST /api/bouncer-decision` (main decision path; orchestrated or legacy depending on flags)
- `POST /api/bouncer-actions` (assignment-forward action generation)
- `POST /api/bouncer-action-guide` (execution coaching)

## 2) Intended Use
The AI component provides behavioral coaching and access-justification support for focus sessions. It is intended for students and knowledge workers who want friction against distraction while allowing assignment-relevant research.

In product behavior, the system performs:
- grant/deny recommendation for blocked-domain access requests,
- confidence and reason-code trace generation,
- suggested next actions tied to assignments,
- short execution guidance for selected actions,
- optional YouTube research routing hints when access is granted.

The system also supports user-controlled response style customization:
- persona presets: `Strict Coach`, `Supportive Mentor`, `Socratic Strategist`,
- custom persona prompt authored by the user.

Personas are intended to change coaching tone and framing while preserving the same focus guardrails.

The model is not intended for high-stakes domains (medical, legal, financial advice), identity verification, or safety-critical autonomous decision making.

## 3) Data
### Training Data
This project does not train or fine-tune the underlying LLM. Training data is managed by the model provider.

### Inference Inputs (Product Data)
At runtime, the system receives:
- target domain being requested,
- user rationale text,
- selected assignment context,
- selected persona mode (`preset` or `custom`) and corresponding preset id/custom prompt,
- selected action payload for action-guidance calls.

Additional non-LLM signals are computed from:
- deadline urgency,
- assignment progress state,
- domain risk catalog,
- rationale specificity and keyword features,
- prior intervention/outcome history (mock telemetry store).

### Data Sources
- Assignment data currently comes from local mock endpoints (`/api/canvas/demo-assignments` and `/api/mock/*`).
- Resource retrieval context comes from in-memory mock resources.
- User rationale and persona come from extension UI input.
- Domain context comes from extension interception.
- Feedback/outcomes are captured via mock telemetry endpoints when telemetry flag is enabled.

### Data Characteristics and Known Limitations
- Inputs are short-form and user-authored, often ambiguous.
- Assignment/resource context is currently mock and not full LMS fidelity.
- Telemetry/evaluation data is in-memory and reset with server restart.
- Custom persona prompts are sanitized and length-limited server-side.
- JSON-only + verifier constraints reduce breakage but do not guarantee semantic correctness.

## 4) Evaluation
This project uses product-oriented evaluation rather than standard benchmark reporting.

Current evaluation mechanisms:
- offline replay evaluation over mock interventions (`/api/mock/evaluate-policy`),
- baseline vs threshold-grid-search comparison,
- weighted score balancing correctness and review-rate tradeoffs,
- telemetry summaries for grant/deny and helpfulness rates (`/api/mock/metrics-summary`).

Core metrics tracked/planned:
- decision appropriateness rate,
- review/coverage rate,
- schema adherence and verifier-warning rate,
- action usefulness and user feedback rate,
- fallback frequency.

Persona-specific monitoring consideration:
- compare appropriateness and helpfulness across persona modes to ensure tone customization does not degrade decision quality.

In this context, a good score means high assignment-relevance decisions, low malformed output rate, and user-reported helpful interventions with controlled false-grant risk.

## 5) Performance & Limitations
### Where the model performs well
- Producing concise structured outputs with policy and verifier constraints.
- Generating actionable assignment-forward suggestions.
- Exposing interpretable metadata (confidence/reason code/policy decision) for traceability.

### Where it struggles
- Ambiguous rationales can still lead to uncertain outcomes.
- Retrieval quality is bounded by mock resource coverage and heuristic ranking.
- Small mock telemetry datasets can overfit threshold tuning conclusions.

### Known Failure Modes / Biases / Edge Cases
- Persuasive but weak rationales may still pass in some boundary cases.
- High-confidence policy deny guardrails can be conservative and block legitimate edge requests.
- Verifier may remove or rewrite fields (for safety/consistency), which can reduce response nuance.
- If model API is unavailable, system falls back to policy-only deterministic responses.
- Custom persona prompts may unintentionally bias tone toward overly permissive or overly strict messaging; server-side sanitization and guardrails reduce but do not fully eliminate this risk.

## 6) Improvement Path
Implemented improvement in this iteration:
- hybrid orchestrator + response verifier + decision trace metadata + offline threshold tuning.

Observed impact (qualitative):
- safer and more consistent response shapes,
- better visibility into why decisions happen,
- practical mechanism to tune policy thresholds with replay tests.

Next priority steps:
1. Replace heuristic retrieval with embedding-based retrieval over real LMS artifacts.
2. Add labeled evaluation sets and confusion-matrix reporting for grant/deny behavior.
3. Persist telemetry to durable storage and add privacy-safe analytics dashboards.
4. Calibrate confidence scores with more representative traffic.

## 7) Safety, Privacy, and Governance Notes
- The model is used for productivity coaching, not punitive enforcement.
- Temporary access is time-limited and domain-scoped by extension logic.
- API keys remain server-side (`server/.env`) and are not shipped in extension client code.
- Stakeholders should treat model outputs as assistive suggestions, not authoritative truth.
- Telemetry and offline evaluation are feature-flagged and disabled by default.
- Persona customization is constrained to tone/communication style; policy guardrails and verifier checks still apply regardless of persona choice.

## 8) Versioning
- Product: Focus Agent
- Model provider endpoint: Gemini API
- Model currently configured: `gemini-2.5-flash`
- Model card version: 1.2
- Last updated: 2026-03-04
