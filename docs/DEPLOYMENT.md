# Spendrift backend — public deployment guide

How to host `spendrift-backend` on a VPS (e.g. GCP) so the Spendrift iOS app can call it from anywhere over HTTPS. Docker is optional; the recommended path is **Node + systemd + Caddy**.

---

## What you are deploying


| Item             | Detail                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Runtime          | Node.js **≥ 20**                                                   |
| App              | Stateless Express proxy (`npm run build` → `node dist/index.js`)   |
| Default port     | **8080** (`PORT` in `.env`) — bind on localhost only               |
| Routes           | Under `/v1` (see `docs/openapi.yaml`); plus `/ingest` (PostHog) and `/sentry` (Sentry tunnel, no auth) |
| Health (no auth) | `GET /v1/health`                                                   |
| Protected        | `POST /v1/voice/parse-transaction`, `POST /v1/statements/parse`, `POST /v1/receipts/parse` |
| Auth             | `Authorization: Bearer <token>` matching `SPENDRIFT_CLIENT_TOKENS` |
| Data store       | None — secrets and OpenAI calls only                               |
| Long requests    | Up to **120s** (`UPSTREAM_TIMEOUT_MS`) — configure proxy timeouts  |
| Diagnostics      | Optional Sentry (`SENTRY_DSN`, `SENTRY_TUNNEL_DSN`) — see below    |


The iOS app reads:

- `SPENDRIFT_BACKEND_BASE_URL` → `SpendriftBackendBaseURL` in `Info.plist`
- `SPENDRIFT_BACKEND_CLIENT_TOKEN` → `SpendriftBackendClientToken`
- `SPENDRIFT_POSTHOG_API_KEY` → `SpendriftPostHogAPIKey` (analytics via `/ingest`)
- `SPENDRIFT_SENTRY_DSN` → `SpendriftSentryDSN` (diagnostics via `/sentry` tunnel)

Set these in `Spendrift/Spendrift/Configuration/DevSecrets.xcconfig` and `ProdSecrets.xcconfig` (gitignored).

---

## Sentry diagnostics (optional)

The backend supports two Sentry integration points:

| Route / env | Purpose |
| ----------- | ------- |
| `POST /sentry` | Tunnel for iOS Sentry envelopes (no bearer auth; DSN validated in envelope) |
| `SENTRY_DSN` | Backend's own Sentry project for server exceptions |
| `SENTRY_TUNNEL_DSN` | Must match the iOS app's `SPENDRIFT_SENTRY_DSN` when tunnel is enabled |
| `SENTRY_ENVIRONMENT` | Defaults to `NODE_ENV` |
| `SENTRY_RELEASE` | Release string shown in Sentry (e.g. git SHA at deploy) |

Omit `SENTRY_DSN` to disable server-side Sentry entirely. Omit `SENTRY_TUNNEL_DSN` to reject iOS tunnel traffic with 503.

Full methodology: `Spendrift/docs/articles/sentry-diagnostics-methodology.md`.

---

## Target architecture

```text
iOS (anywhere)
    │  HTTPS + Bearer token
    ▼
api.spendrift.ronakpunase.dev:443   (example API hostname)
    │
    ▼
Caddy (or nginx) — TLS termination, reverse proxy
    │
    ▼
spendrift-backend on 127.0.0.1:8080
    │
    ▼
OpenAI API (server-side API key)
```

**Do not** expose port 8080 on the public internet. Open firewall **80/443** only.

Marketing site (e.g. [spendrift.ronakpunase.dev](https://spendrift.ronakpunase.dev/)) can stay on Vercel; API is a **separate DNS name** on the same VM or another host.

---

## Docker?

**Not required.** Use Docker only if you want reproducible images, multiple containers, or CI-built artifacts.


| Without Docker                        | With Docker                                       |
| ------------------------------------- | ------------------------------------------------- |
| `npm ci && npm run build` on the VM   | Same app in an image                              |
| **systemd** runs `node dist/index.js` | `docker compose` or similar                       |
| **Caddy** on the host                 | Caddy on host → container port, or all-in Compose |


Both approaches can be fully public and production-grade.

---

## DNS

### API hostname (recommended)

Use a dedicated API subdomain, e.g.:

```text
api.spendrift.ronakpunase.dev
```

This is a normal subdomain. Add a record in the zone for `ronakpunase.dev`:


| Type      | Name            | Value                               | When                                                   |
| --------- | --------------- | ----------------------------------- | ------------------------------------------------------ |
| **A**     | `api.spendrift` | VM public IP (e.g. `34.14.163.195`) | Backend on GCP/VPS — **preferred**                     |
| **CNAME** | `api.spendrift` | Another hostname                    | Only if pointing at a hostname, not the marketing site |


**Do not** CNAME the API to `spendrift.ronakpunase.dev` unless the API and static site share the same origin (they usually do not: site on Vercel, API on VM).

The frontend record (`spendrift` → Vercel) and the API record (`api.spendrift` → VM IP) are independent.

Verify:

```bash
dig +short api.spendrift.ronakpunase.dev
curl -s https://api.spendrift.ronakpunase.dev/v1/health
```

---

## Server setup

### 1. Install Node 20+

```bash
# Example with nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell
nvm install 20
node -v
```

### 2. Deploy the application

Clone or sync the repo to e.g. `/home/<user>/spendrift-backend`:

```bash
cd ~/spendrift-backend
npm ci
npm run build
```

Required on the server (not only `dist/`):

- `dist/` (from `npm run build`)
- `node_modules/` (from `npm ci`)
- `.env` (secrets — never commit)
- `prompts/basePrompt.md` (loaded at startup from project root)

### 3. Production `.env`

Copy from `.env.example` and set production values:


| Variable                            | Notes                                                    |
| ----------------------------------- | -------------------------------------------------------- |
| `PORT`                              | `8080` (internal; proxy fronts it)                       |
| `NODE_ENV`                          | `production`                                             |
| `SPENDRIFT_CLIENT_TOKENS`           | Long random secret(s); comma-separated for multiple      |
| `OPENAI_API_KEY`                    | Real key; never commit                                   |
| `MAX_PDF_BYTES` / `MAX_AUDIO_BYTES` | Use real limits (defaults in code ~20MB PDF, ~3MB audio) |


Generate a client token:

```bash
openssl rand -hex 32
```

Use the **same** value in iOS `SPENDRIFT_BACKEND_CLIENT_TOKEN`.

---

## systemd service

`ExecStart` must run the **entry file**, not the `dist` directory:

```ini
# Correct
ExecStart=/full/path/to/node dist/index.js

# Wrong
ExecStart=/full/path/to/node dist
```

This matches `package.json` `"start": "node dist/index.js"`.

Example `/etc/systemd/system/spendrift-backend.service`:

```ini
[Unit]
Description=Spendrift AI backend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/spendrift-backend
Environment=NODE_ENV=production
EnvironmentFile=/home/youruser/spendrift-backend/.env
ExecStart=/home/youruser/.nvm/versions/node/v20.x.x/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Critical:**


| Requirement                             | Why                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `WorkingDirectory` = project root       | `dotenv` loads `.env` from cwd; `prompts/` path resolves relative to repo root |
| Full path to `node`                     | systemd does not load nvm from interactive shells                              |
| `npm run build` before start            | Without `dist/index.js`, the service exits immediately                         |
| `EnvironmentFile` (optional but robust) | Ensures env vars even if cwd changes                                           |


Enable and test on the VM:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spendrift-backend
curl -s http://127.0.0.1:8080/v1/health
```

Alternative: **PM2** instead of systemd.

---

## Caddy (HTTPS + reverse proxy)

Install Caddy on the VM. Example `/etc/caddy/Caddyfile`:

```caddy
api.spendrift.ronakpunase.dev {
    reverse_proxy 127.0.0.1:8080 {
        transport http {
            read_timeout 120s
            write_timeout 120s
        }
    }
}
```

Reload Caddy; it obtains a Let's Encrypt certificate for that hostname automatically.

Test publicly:

```bash
curl -s https://api.spendrift.ronakpunase.dev/v1/health
```

### Auth smoke test

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.spendrift.ronakpunase.dev/v1/voice/parse-transaction
```

A 4xx without a body is fine — it confirms routing and auth.

---

## iOS app configuration

In `ProdSecrets.xcconfig` (and `DevSecrets.xcconfig` if needed):

```xcconfig
SPENDRIFT_BACKEND_BASE_URL = https://api.spendrift.ronakpunase.dev
SPENDRIFT_BACKEND_CLIENT_TOKEN = <same as SPENDRIFT_CLIENT_TOKENS on server>
```

Rules:

- Base URL = **origin only** (no trailing slash, no `/v1` path).
- Use **HTTPS** for remote hosts (App Transport Security).
- Rebuild the app after changing xcconfig.

`Info.plist` allows local networking for development; production remote API should still use HTTPS.

---

## Multiple projects on one VM

One VM can serve many domains. Caddy routes by hostname:

```caddy
api.spendrift.ronakpunase.dev {
    reverse_proxy 127.0.0.1:8080 { ... }
}

other.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Per new project:

1. DNS **A** (or **CNAME**) → same VM IP
2. App on its own local port (`8081`, `3000`, …)
3. Separate **systemd** unit and `.env`
4. New Caddy site block

Firewall stays **80/443** only; do not publish app ports publicly.

---

## Security checklist

1. **HTTPS** for any public API hostname.
2. **Strong** `SPENDRIFT_CLIENT_TOKENS`; rotate if a build or log leaks it.
3. **Never** commit `.env` or API keys to git.
4. Keep **8080** on `127.0.0.1` only; reverse proxy faces the internet.
5. SSH: keys, minimal exposure.
6. Optional: Cloudflare proxy/WAF, rate limits at Caddy.
7. This service sends **audio/PDFs to OpenAI** — treat the VM as a secrets and PII boundary.

---

## Deploying code changes (day 2 and after)

Every backend-only change follows the same loop: **get new files on the VM → install deps if needed → rebuild `dist/` → restart the service → smoke-test**.

After CI is configured, a push to `**master`** under `spendrift-backend/` runs that loop automatically (see [CI/CD](#cicd-github-actions)). Caddy and DNS do not need to change for normal code edits.

### What stays on the server across deploys


| File / setting             | Updated on deploy?                                            |
| -------------------------- | ------------------------------------------------------------- |
| `.env` on the VM           | **No** — edit manually only when you add/change env vars      |
| `prompts/basePrompt.md`    | **Yes** — if you changed prompts, redeploy source (git/rsync) |
| `node_modules/`            | **Yes** — when `package.json` / lockfile changed (`npm ci`)   |
| `dist/`                    | **Yes** — always rebuilt with `npm run build`                 |
| Caddy / DNS / iOS xcconfig | **No** — unless hostname, TLS, or client token changes        |


### Path A — Git on the VM (recommended if the repo is on GitHub)

On your Mac: commit and push.

```bash
git add .
git commit -m "Describe the backend change"
git push origin main   # or your default branch
```

SSH into the VM and run:

```bash
cd ~/spendrift-backend
git pull
npm ci                 # skip if package.json / lockfile unchanged
npm run build
sudo systemctl restart spendrift-backend
curl -s http://127.0.0.1:8080/v1/health
curl -s https://api.spendrift.ronakpunase.dev/v1/health
```

If `git pull` reports conflicts, resolve on the VM or reset to a clean deploy from your machine (Path B).

### Path B — rsync from your Mac (no git on server, or quick one-off)

From your Mac (adjust user, host, and local path):

```bash
rsync -avz --delete \
  --exclude node_modules \
  --exclude .env \
  /Volumes/ssd/Development/projects/spendrift/spendrift-backend/ \
  punase.ronak99@34.14.163.195:~/spendrift-backend/
```

Then on the VM:

```bash
cd ~/spendrift-backend
npm ci
npm run build
sudo systemctl restart spendrift-backend
```

**Never rsync `.env`** — the server keeps its own secrets. `--exclude .env` is intentional.

### After restart

- **Downtime:** Usually a few seconds while Node restarts. In-flight requests may fail; clients can retry.
- **Logs:** `journalctl -u spendrift-backend -n 50 --no-pager` if health check fails.
- **Failed start:** Service exits if `.env` is invalid or `prompts/` is missing — fix and `sudo systemctl restart spendrift-backend` again.

### When you also need an iOS / App Store change


| Change type                                      | Server deploy            | iOS rebuild                                      |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------ |
| Route handlers, prompts, models, OpenAI logic    | Yes                      | No                                               |
| New env var on server only                       | Edit VM `.env` + restart | No                                               |
| New API path or auth scheme                      | Yes                      | Yes — update `SpendriftBackendClient` + ship app |
| New `SPENDRIFT_BACKEND_BASE_URL` or client token | DNS/env as needed        | Yes — xcconfig + new build                       |


Most day-to-day backend work is **server-only**; users keep the same app binary pointing at the same API URL.

### Dependency or Node version changes

If `package.json` or `package-lock.json` changed:

```bash
npm ci
npm run build
```

If you upgraded required Node version (`engines.node`), install that Node version on the VM and update the **full path** in `ExecStart` in the systemd unit, then `sudo systemctl daemon-reload && sudo systemctl restart spendrift-backend`.

### Changing server configuration (not TypeScript)

Edit `/home/<user>/spendrift-backend/.env` on the VM, then:

```bash
sudo systemctl restart spendrift-backend
```

No `npm run build` needed unless you also pulled code changes.

### CI/CD (GitHub Actions)

Pushes to `**master**` that touch `spendrift-backend/**` run `[.github/workflows/deploy-spendrift-backend.yml](../../.github/workflows/deploy-spendrift-backend.yml)`. The workflow SSHs to the VPS and runs the same steps as Path A: `git pull` → `npm ci` → `npm run build` → `systemctl restart` → health checks.

Manual deploy on the server (same commands):

```bash
GIT_ROOT=~/spendrift DEPLOY_PATH=~/spendrift/spendrift-backend \
  PUBLIC_HEALTH_URL=https://api.spendrift.ronakpunase.dev/v1/health \
  bash ~/spendrift/spendrift-backend/scripts/deploy-remote.sh
```

Adjust `GIT_ROOT` / `DEPLOY_PATH` if your clone layout differs.

#### One-time server setup for CI

1. **Clone the monorepo** on the VM (SSH deploy key or HTTPS with token):
  ```bash
   git clone git@github.com:<you>/spendrift.git ~/spendrift
   cd ~/spendrift/spendrift-backend
   cp .env.example .env   # then edit .env with production secrets
   npm ci && npm run build
   # systemd + Caddy as in sections above
  ```
2. **Passwordless restart** for the deploy user (replace user name):
  ```bash
   sudo tee /etc/sudoers.d/spendrift-deploy <<'EOF'
   punase.ronak99 ALL=(ALL) NOPASSWD: /bin/systemctl restart spendrift-backend, /bin/systemctl is-active spendrift-backend
   EOF
   sudo chmod 440 /etc/sudoers.d/spendrift-deploy
  ```
3. **Deploy SSH key** — on your Mac:
  ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/spendrift_deploy -N ""
   cat ~/.ssh/spendrift_deploy.pub
  ```
   Append the public key to `~/.ssh/authorized_keys` on the VM for `punase.ronak99`.
4. **GitHub repository secrets** (Settings → Secrets and variables → Actions):

  | Secret                         | Example                                             |
  | ------------------------------ | --------------------------------------------------- |
  | `SSH_HOST`                     | `34.14.163.195`                                     |
  | `SSH_USER`                     | `punase.ronak99`                                    |
  | `SSH_PRIVATE_KEY`              | Contents of `~/.ssh/spendrift_deploy` (private key) |
  | `SSH_GIT_ROOT`                 | `/home/punase.ronak99/spendrift`                    |
  | `SSH_DEPLOY_PATH`              | `/home/punase.ronak99/spendrift/spendrift-backend`  |
  | `PUBLIC_HEALTH_URL` (optional) | `https://api.spendrift.ronakpunase.dev/v1/health`   |

   If you cloned **only** `spendrift-backend` as its own repo at `~/spendrift-backend`, set both `SSH_GIT_ROOT` and `SSH_DEPLOY_PATH` to that same path.
5. **VM git access** — the clone on the VM must be able to `git pull` from GitHub (deploy key added to the repo, or HTTPS credential). The Actions SSH key only logs into the server; it does not authenticate `git pull` unless that key is also added as a deploy key for the repository.
6. **Push workflow to `master`** — merge the workflow file, then backend changes under `spendrift-backend/` auto-deploy.

Trigger manually: Actions → **Deploy spendrift-backend** → **Run workflow**.

`.env` on the VM is never overwritten by CI.

---

## Troubleshooting


| Symptom                             | Likely cause                                             |
| ----------------------------------- | -------------------------------------------------------- |
| Service fails immediately           | Missing `dist/` — run `npm run build`                    |
| `ENOENT` on `prompts/basePrompt.md` | Wrong `WorkingDirectory` or `prompts/` not deployed      |
| Invalid environment configuration   | Missing `.env`, wrong cwd, or empty required vars        |
| iOS “backend not configured”        | Missing/empty xcconfig                                   |
| HTTP 401                            | Token mismatch between iOS and `SPENDRIFT_CLIENT_TOKENS` |
| Connection / ATS errors             | Using `http://` to a public host instead of HTTPS        |
| HTTP 502 / timeouts                 | Bad OpenAI key, model names, or proxy timeout < 120s     |
| Upload rejected                     | `MAX_PDF_BYTES` / `MAX_AUDIO_BYTES` too low in `.env`    |


Logs:

```bash
journalctl -u spendrift-backend -f
```

---

## What not to use for this goal


| Approach                | Why                                                |
| ----------------------- | -------------------------------------------------- |
| Tailscale / private VPN | Only your devices — not a public App Store backend |
| Raw `http://IP:8080`    | No TLS, brittle if IP changes, ATS issues          |
| Exposing 8080 publicly  | Bypasses TLS and complicates multi-app hosting     |
| `node dist` in systemd  | Invalid — must be `node dist/index.js`             |


---

## Related docs

- HTTP contract: `openapi.yaml`
- Implementation spec: `BACKEND_AI_PROXY_SPEC.md`
- Local run: `npm run dev` (tsx) or `npm run build && npm start`

