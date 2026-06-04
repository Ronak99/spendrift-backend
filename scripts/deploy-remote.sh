#!/usr/bin/env bash
# Run on the VPS (manually or via GitHub Actions SSH).
# Requires: git checkout, Node 20+, systemd unit spendrift-backend.
set -euo pipefail

GIT_ROOT="${GIT_ROOT:-"${HOME}/spendrift"}"
DEPLOY_PATH="${DEPLOY_PATH:-"${GIT_ROOT}/spendrift-backend"}"
BRANCH="${BRANCH:-master}"
PORT="${PORT:-8080}"
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-spendrift-backend}"

echo "==> git pull (${BRANCH}) in ${GIT_ROOT}"
cd "${GIT_ROOT}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> npm ci && build in ${DEPLOY_PATH}"
cd "${DEPLOY_PATH}"
npm ci
npm run build

echo "==> restart ${SYSTEMD_SERVICE}"
sudo systemctl restart "${SYSTEMD_SERVICE}"
sudo systemctl is-active --quiet "${SYSTEMD_SERVICE}"

echo "==> health check"
curl -sf "http://127.0.0.1:${PORT}/v1/health"
echo ""

if [[ -n "${PUBLIC_HEALTH_URL:-}" ]]; then
  echo "==> public health check"
  curl -sf "${PUBLIC_HEALTH_URL}"
  echo ""
fi

echo "Deploy finished successfully."
