# Focus Agent Architecture Diagram

## 1) System architecture (layered)

```mermaid
flowchart TB
  classDef layer fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#0f172a;
  classDef core fill:#ffffff,stroke:#64748b,stroke-width:1px,color:#0f172a;

  subgraph L1[Client Layer - Chrome]
    direction LR
    U[User]
    POP[Popup App]
    BOU[Bouncer App]
    BG[Background Worker]
    YS[YouTube Sanitizer]
    ST[(chrome.storage.local)]
    DNR[Dynamic Net Rules]
    ALM[Alarms]
  end

  subgraph L2[Application Layer - Node + Express]
    direction LR
    API[/REST API/]
    ORCH[Decision Orchestrator]
    SIG[Signal Extraction]
    POL[Policy Scoring]
    RET[Retrieval Context]
    VER[Response Verifier]
    ACT[Action Planner]
    AGU[Action Guide]
    TEL[Telemetry + Outcomes]
    EVA[Offline Eval + Tuning]
    FF[Feature Flags]
    MD[(Mock Data Store)]
    ENV[(server.env)]
  end

  subgraph L3[Model Provider Layer]
    GEM[Gemini API - gemini-2.5-flash]
  end

  U --> POP
  U --> BOU
  POP <--> ST
  BOU <--> ST
  BG <--> ST
  BG <--> DNR
  BG <--> ALM
  BOU <--> YS

  POP --> API
  BOU --> API
  BG --> API

  API --> FF
  API --> ORCH
  API --> ACT
  API --> AGU
  API --> TEL
  API --> EVA

  ORCH --> SIG
  ORCH --> POL
  ORCH --> RET
  ORCH --> VER
  ORCH --> GEM

  ACT --> GEM
  AGU --> GEM

  SIG --> MD
  POL --> MD
  RET --> MD
  TEL --> MD
  EVA --> MD
  API --> ENV

  class L1,L2,L3 layer;
  class U,POP,BOU,BG,YS,ST,DNR,ALM,API,ORCH,SIG,POL,RET,VER,ACT,AGU,TEL,EVA,FF,MD,ENV,GEM core;
```

## 2) Decision pipeline (orchestrated mode)

```mermaid
sequenceDiagram
  autonumber
  participant B as Bouncer UI
  participant API as Server API
  participant OR as Orchestrator
  participant SIG as Signal Extractor
  participant POL as Policy Scorer
  participant RET as Retrieval
  participant LLM as Gemini
  participant VER as Verifier

  B->>API: POST /api/bouncer-decision
  API->>OR: route request (if ENABLE_AI_ORCHESTRATOR=true)
  OR->>SIG: build intervention signals
  SIG-->>OR: feature bundle
  OR->>POL: score prior (allow/deny/review)
  POL-->>OR: policyDecision + confidence + reasonCode
  OR->>RET: fetch top-K evidence snippets
  RET-->>OR: retrieved context
  OR->>LLM: grounded prompt + policy context
  LLM-->>OR: raw JSON decision
  OR->>VER: normalize + enforce guardrails
  VER-->>OR: verified decision + warnings
  OR-->>API: final payload + metadata
  API-->>B: grant/deny + trace fields
```

## 3) Rollout modes

- Orchestrated mode: ENABLE_AI_ORCHESTRATOR=true
- Legacy mode: ENABLE_AI_ORCHESTRATOR=false (LLM-only path)
- Verifier off: ENABLE_RESPONSE_VERIFIER=false
- Metadata off: ENABLE_DECISION_TRACE_METADATA=false
- Telemetry/eval APIs disabled by default unless enabled via flags
