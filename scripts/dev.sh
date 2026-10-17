#!/usr/bin/env bash
set -eo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "========================================================"
echo "          TaskCatch Unified Live Development            "
echo "========================================================"

# 1. Ensure Docker PostgreSQL 16 is running
echo "➜ Checking PostgreSQL database container..."
if ! docker compose ps --filter "status=running" | grep -q "postgres"; then
  echo "  Starting PostgreSQL container on port 5433..."
  docker compose up -d postgres
fi

# Wait briefly for PostgreSQL readiness
for i in {1..15}; do
  if docker compose exec -T postgres pg_isready -U taskcatch -d taskcatch >/dev/null 2>&1; then
    echo "✓ PostgreSQL is ready on port 5433."
    break
  fi
  sleep 1
done

# 2. Free ports if systemd services are running in background
if systemctl --user is-active --quiet taskcatch-api 2>/dev/null || systemctl --user is-active --quiet taskcatch-stt 2>/dev/null; then
  echo "➜ Stopping background systemd services so live logs stream to this terminal..."
  systemctl --user stop taskcatch-api taskcatch-stt 2>/dev/null || true
  sleep 1
  echo "✓ Background daemons stopped. Terminal now owns ports 3000 and 8000."
fi

# Ensure Python virtual environment exists
PYTHON_BIN="$PROJECT_DIR/apps/stt/.venv/bin/python"
if [ ! -f "$PYTHON_BIN" ]; then
  echo "➜ Setting up Python virtual environment for STT..."
  python3 -m venv "$PROJECT_DIR/apps/stt/.venv"
  "$PROJECT_DIR/apps/stt/.venv/bin/pip" install -r "$PROJECT_DIR/apps/stt/requirements.txt"
fi

# Ensure Ollama server is running if installed
OLLAMA_BIN="$HOME/.local/bin/ollama"
if command -v ollama >/dev/null 2>&1; then
  OLLAMA_BIN="$(command -v ollama)"
fi

if [ -x "$OLLAMA_BIN" ]; then
  if ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "➜ Starting local Ollama daemon..."
    mkdir -p "$HOME/.ollama"
    nohup "$OLLAMA_BIN" serve > "$HOME/.ollama/server.log" 2>&1 &
    sleep 2
    echo "✓ Ollama server active on http://127.0.0.1:11434"
  else
    echo "✓ Ollama server active on http://127.0.0.1:11434"
  fi
fi

# 3. Check for --desktop or dev:all mode
INCLUDE_DESKTOP=false
for arg in "$@"; do
  if [ "$arg" == "--desktop" ] || [ "$arg" == "--all" ]; then
    INCLUDE_DESKTOP=true
  fi
done

echo ""
echo "🚀 Starting services with unified live terminal logs:"
echo "   • API Server:     http://localhost:3000"
echo "   • Web Frontend:   http://localhost:5174"
echo "   • Faster-Whisper: http://localhost:8000"
if [ "$INCLUDE_DESKTOP" = true ]; then
  echo "   • Desktop Widget: Electron Overlay"
fi
echo ""
echo "Press Ctrl+C at any time to stop all services."
echo "--------------------------------------------------------"

if [ "$INCLUDE_DESKTOP" = true ]; then
  npx concurrently \
    --kill-others \
    --prefix "[{name}]" \
    --names "api,stt,web,desktop" \
    --prefix-colors "blue.bold,green.bold,magenta.bold,yellow.bold" \
    "npm run dev --workspace=@taskcatch/api" \
    "PYTHONUNBUFFERED=1 $PYTHON_BIN apps/stt/server.py" \
    "npm run dev --workspace=@taskcatch/web" \
    "npm start --workspace=@taskcatch/desktop"
else
  npx concurrently \
    --kill-others \
    --prefix "[{name}]" \
    --names "api,stt,web" \
    --prefix-colors "blue.bold,green.bold,magenta.bold" \
    "npm run dev --workspace=@taskcatch/api" \
    "PYTHONUNBUFFERED=1 $PYTHON_BIN apps/stt/server.py" \
    "npm run dev --workspace=@taskcatch/web"
fi
