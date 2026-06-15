# Spendrift Backend — Roadmap & Future Prospects

> **Context:** The iOS app currently calls OpenAI directly with an API key embedded in the app bundle. As downloads grow (driven by YouTube traction), this creates cost and security risk. The backend proxy is the foundation for safe scaling and future monetization.
>
> **Last updated:** June 15, 2026

---

## Why the Backend Matters Now

| Risk (today) | What happens as downloads grow |
|--------------|----------------------------------|
| OpenAI key in downloadable binary | Key can be extracted and abused |
| No per-user limits | Every voice/PDF user costs money; viral video = surprise bill |
| Model/prompt changes require App Store release | Slow iteration on AI quality and cost |
| No cost visibility | Can't tie spend to features or users |

The backend proxy addresses all four. It is **urgent**, not optional — see also `Spendrift/docs/NEXT_STEPS_STRATEGY.md` for the app-side plan.

---

## Phase 1 — Ship the AI Proxy (current priority)

**Goal:** Move all third-party AI traffic off the device. Full contract in `BACKEND_AI_PROXY_SPEC.md`.

### Endpoints to complete

| Route | Replaces | Upstream model |
|-------|----------|----------------|
| `POST /voice/parse` | `OpenAIVoiceTransactionService` | `gpt-audio-mini` |
| `POST /statements/parse` | `OpenAIBankStatementService` | `gpt-4o` |
| `GET /health` | — | — |

### Must-haves before iOS cutover

- [ ] OpenAI API key stored server-side only (`OPENAI_API_KEY` in `.env`)
- [ ] Request/response shapes match iOS decoders (`OpenAIVoiceTransactionPayload`, `OpenAIStatementPayload`)
- [ ] Prompt assembly matches current iOS behavior (`basePrompt.md`, category blocks, date context)
- [ ] Error mapping to stable HTTP status codes (see spec §10)
- [ ] Deploy to production per `DEPLOYMENT.md`
- [ ] Rotate/revoke the key that was in the iOS bundle after cutover

### iOS integration (after proxy is live)

- Point voice and statement services at proxy base URL
- Remove `OpenAIApiKey` from `Info.plist` / `AppSecrets`
- Ship App Store update

---

## Phase 2 — Rate Limiting & Cost Control

**Why:** Without limits, a single viral video or a scraped API key can generate unbounded OpenAI spend.

### Recommended approach

| Layer | Implementation |
|-------|----------------|
| **Per-device identity** | iOS sends a stable anonymous device ID (e.g. `identifierForVendor` or generated UUID in Keychain) |
| **Rate limits** | Cap voice parses and statement imports per device per day/month |
| **Global circuit breaker** | Hard daily spend cap on the server; return 503 when exceeded |
| **Auth** | Simple API key or signed requests from the app (see spec §4) |

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

- Request count by endpoint (`/voice/parse`, `/statements/parse`)
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

These are **not** urgent but are natural extensions once Phases 1–3 are stable.

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
Phase 1: AI proxy (ship now)
    ↓
Phase 2: Rate limits + per-device quotas
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
