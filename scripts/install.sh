#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "         TaskCatch Production Installer           "
echo "=================================================="

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "➜ Checking system prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required (v18+)."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3.11+ is required."; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "❌ ffmpeg is required for audio normalization."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required for PostgreSQL 16."; exit 1; }

echo "✓ System dependencies found."

# 1. Environment file setup
if [ ! -f .env ]; then
  echo "➜ Generating .env from .env.example..."
  cp .env.example .env
  # Generate random cookie secret
  COOKIE_HEX=$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | head -c 48)
  sed -i "s/COOKIE_SECRET=.*/COOKIE_SECRET=taskcatch_secret_${COOKIE_HEX}/" .env
  echo "✓ .env created."
fi

# 2. Node dependencies & Build
echo "➜ Installing npm workspace packages..."
npm install

echo "➜ Building monorepo packages (shared, api, web, desktop)..."
npm run build

# 3. Python STT virtualenv setup
echo "➜ Setting up Python virtual environment for faster-whisper sidecar..."
if [ ! -d "apps/stt/.venv" ]; then
  python3 -m venv apps/stt/.venv
fi
apps/stt/.venv/bin/pip install --upgrade pip
if [ -f apps/stt/requirements.txt ]; then
  apps/stt/.venv/bin/pip install -r apps/stt/requirements.txt
fi
echo "✓ Python sidecar environment ready."

# 4. PostgreSQL Database
echo "➜ Starting PostgreSQL 16 container..."
docker compose up -d postgres

echo "➜ Waiting for PostgreSQL to be ready on port 5433..."
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U taskcatch -d taskcatch >/dev/null 2>&1; then
    echo "✓ PostgreSQL is ready."
    break
  fi
  sleep 1
done

echo "➜ Applying Drizzle database migrations..."
npm run db:migrate --workspace=@taskcatch/api

# 5. systemd User Services installation
echo "➜ Installing systemd user units..."
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_USER_DIR"

cp systemd/taskcatch-api.service "$SYSTEMD_USER_DIR/"
cp systemd/taskcatch-stt.service "$SYSTEMD_USER_DIR/"
cp systemd/taskcatch-postgres.service "$SYSTEMD_USER_DIR/"

systemctl --user daemon-reload
systemctl --user enable taskcatch-postgres taskcatch-stt taskcatch-api
systemctl --user restart taskcatch-postgres taskcatch-stt taskcatch-api

echo ""
echo "=================================================="
echo "✓ TaskCatch installed and running successfully!"
echo "=================================================="
echo "Web PWA: http://localhost:3000"
echo "API Health: http://localhost:3000/health"
echo "STT Health: http://localhost:8000/health"
echo ""
echo "To access from your mobile phone via Tailscale HTTPS:"
echo "  tailscale serve --https=443 http://localhost:3000"
echo ""
