#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "         TaskCatch Uninstaller                    "
echo "=================================================="

SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "➜ Stopping and disabling systemd user services..."
systemctl --user stop taskcatch-api taskcatch-stt taskcatch-postgres || true
systemctl --user disable taskcatch-api taskcatch-stt taskcatch-postgres || true

echo "➜ Removing systemd unit files..."
rm -f "$SYSTEMD_USER_DIR/taskcatch-api.service"
rm -f "$SYSTEMD_USER_DIR/taskcatch-stt.service"
rm -f "$SYSTEMD_USER_DIR/taskcatch-postgres.service"
systemctl --user daemon-reload

echo "➜ Stopping Docker container..."
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
docker compose stop postgres || true

echo ""
echo "✓ TaskCatch services stopped and uninstalled."
echo "Note: Your database data and audio archives in ~/.taskcatch and docker volumes were kept intact."
echo "To completely wipe data, run: docker compose down -v && rm -rf ~/.taskcatch"
echo ""
