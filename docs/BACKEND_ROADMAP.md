# Spendrift Backend — Roadmap & Future Prospects

> **Context:** All Spendrift AI traffic is proxied through this backend. The iOS app never calls OpenAI directly and does not ship an OpenAI API key — only `SpendriftBackendBaseURL` and `SpendriftBackendClientToken` in `Info.plist`. OpenAI credentials live server-side in `.env` (`OPENAI_API_KEY`).
>
> **Last updated:** June 15, 2026

---

## Current Architecture (confirmed)

| Layer | Behavior |
|-------|----------|
| **iOS** | `OpenAIVoiceTransactionService` and `OpenAIBankStatementService` delegate to `SpendriftBackendClient` |
| **Backend** | `POST /v1/voice/parse-transaction` and `POST /v1/statements/parse` call OpenAI via `openaiClient.ts` |
| **Secrets** | `OPENAI_API_KEY` in backend `.env` only; never in git or the app bundle |
| **Auth** | Protected routes require `Authorization: Bearer {SPENDRIFT_CLIENT_TOKENS}`; `GET /v1/health` is public |

There is no `OpenAIClient.swift` in the app target. Legacy type names (`OpenAIVoiceTransactionPayload`, etc.) remain on iOS for decoding only — they describe response shapes, not direct OpenAI usage.

Full contract: `BACKEND_AI_PROXY_SPEC.md`.

---

## Why the Backend Matters Now

Phase 1 (the proxy) is **done in code**. Remaining risks are operational and scaling-related:

| Risk (today) | What happens as downloads grow |
|--------------|----------------------------------|
| No per-device rate limits | Every voice/PDF user costs money; viral video = surprise bill |
| No global spend cap | A bug, abuse, or traffic spike can run up unbounded OpenAI spend |
| Limited cost visibility | Can't tie spend to features, devices, or app versions |
| Legacy App Store builds | Older binaries that embedded an OpenAI key may still be in the wild until users upgrade |

The backend is the foundation for limits, observability, and monetization — see also `Spendrift/docs/NEXT_STEPS_STRATEGY.md`.

---

## Phase 1 — AI Proxy ✅ (complete)

**Goal:** Move all third-party AI traffic off the device.

### Endpoints (live)

| Route | iOS caller | Upstream model |
|-------|----------|----------------|
| `POST /v1/voice/parse-transaction` | `SpendriftBackendClient.parseVoiceTransaction` | `gpt-audio-mini` |
| `POST /v1/statements/parse` | `SpendriftBackendClient.parseStatement` | `gpt-4o` |
| `GET /v1/health` | `SpendriftBackendClient.fetchHealth` | — |

### Completed

- [x] OpenAI API key stored server-side only (`OPENAI_API_KEY` in `.env`)
- [x] iOS routes voice and statement AI through `SpendriftBackendClient` (no direct OpenAI calls)
- [x] `OpenAIApiKey` removed from `Info.plist` / `AppSecrets`; app uses backend URL + client token
- [x] Request/response shapes match iOS decoders (`OpenAIVoiceTransactionPayload`, `OpenAIStatementPayload`)
- [x] Prompt assembly on backend (`basePrompt.md`, category blocks, date context)
- [x] Error mapping to stable HTTP status codes (see spec §10)
- [x] Deploy path documented in `DEPLOYMENT.md`

### Remaining ops (if not already done)

- [ ] Confirm all App Store users are on a backend-proxy build
- [ ] Rotate/revoke any OpenAI key that was ever embedded in a shipped iOS binary

---

## Phase 2 — Rate Limiting & Cost Control (current priority)

**Why:** Without limits, growth or abuse can generate unbounded OpenAI spend even though the key is no longer in the app.

### Recommended approach

| Layer | Implementation |
|-------|----------------|
| **Per-device identity** | iOS sends a stable anonymous device ID (e.g. `identifierForVendor` or generated UUID in Keychain) |
| **Rate limits** | Cap voice parses and statement imports per device per day/month |
| **Global circuit breaker** | Hard daily spend cap on the server; return 503 when exceeded |
| **Auth** | Client token already required (see spec §4); extend with per-device tracking |

### Suggested initial limits (tune after analytics)

| Feature | Free tier (starting point) |
|---------|---------------------------|
| Voice parse | 20/month per device |
| Statement import | 3 PDFs/month per device |

These become enforceable once StoreKit monetization lands on iOS — the backend is the gatekeeper.

---

## Phase 3 — Observability & Cost Tracking

**Why:** You need to know which features burn money and whether limits are working.

### Logging (server-side)

- Request count by endpoint (`/v1/voice/parse-transaction`, `/v1/statements/parse`)
- Upstream latency and error rate
- Estimated cost per request (token/audio duration heuristics)
- Per-device usage counters (for rate limit enforcement)

### Optional integrations

- Structured logs to a hosted service (e.g. Datadog, Axiom, or plain file + `journalctl` on VPS)
- Sentry for backend exceptions (MCP available in dev environment)
- Daily cost alert if OpenAI spend exceeds a threshold

---

## Phase 4 — Monetization Enablement

**Why:** AI features have real marginal cost. The backend is what makes paid tiers possible.

### What the backend enables

| iOS monetization idea | Backend requirement |
|-----------------------|---------------------|
| Free: N voice parses/month; Pro: unlimited | Per-device quota + Pro flag (receipt validation endpoint or shared secret) |
| Free: 1–3 PDFs/month; Pro: higher | Same quota system |
| Consumable "statement packs" | One-time quota bump stored server-side |
| 7-day Pro trial | Time-bounded elevated limits |

### Receipt validation (future)

- iOS sends App Store receipt or StoreKit 2 transaction JWS to backend
- Backend verifies with Apple and sets `tier: pro` on the device record
- Rate limits read tier at request time

No need to build this until analytics show which AI feature has pull — but **design quotas in Phase 2** so adding tiers is a config change, not a rewrite.

---

## Phase 5 — Future Prospects (beyond proxy)

These are **not** urgent but are natural extensions once Phases 2–3 are stable.

| Capability | Benefit |
|------------|---------|
| **Provider failover** | Swap `gpt-audio-mini` / `gpt-4o` for cheaper or better models without an app release |
| **Prompt A/B testing** | Serve different system prompts by app version or cohort; measure parse quality |
| **Response caching** | Dedupe identical statement re-imports (hash PDF bytes) |
| **Batch statement processing** | Queue large PDFs; return job ID + webhook/poll (for Pro tier) |
| **Admin dashboard** | Usage, cost, top error types, active devices |
| **Multi-region deploy** | Lower latency for non-India users if audience expands |
| **Webhook for cost alerts** | Slack/email when daily spend crosses threshold |

### Explicitly out of scope (for now)

- Storing user transaction databases — Spendrift remains on-device / iCloud
- User accounts or login — device-scoped identity is enough for v1
- Non-AI backend features — no sync, no social, no cloud backup

---

## Priority Summary

```
Phase 1: AI proxy ✅ (complete)
    ↓
Phase 2: Rate limits + per-device quotas (current)
    ↓
Phase 3: Cost logging + alerts
    ↓
Phase 4: Monetization tiers (when iOS analytics justify it)
    ↓
Phase 5: Failover, A/B prompts, admin tooling (as needed)
```

---

## Related Docs

- `BACKEND_AI_PROXY_SPEC.md` — full API contract, prompts, error mapping
- `DEPLOYMENT.md` — production deploy guide
- `openapi.yaml` — API schema
- `Spendrift/docs/NEXT_STEPS_STRATEGY.md` — iOS app strategy (analytics, marketing, UX)
- `Spendrift/docs/FEATURES_AND_MONETIZATION.md` — monetization brainstorm (Tier A = AI limits)
