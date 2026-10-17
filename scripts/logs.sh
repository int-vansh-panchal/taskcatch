#!/usr/bin/env bash
# Live log streaming for TaskCatch systemd services

echo "========================================================"
echo "      Streaming Live TaskCatch Systemd Logs             "
echo "========================================================"
echo "Following logs from: taskcatch-api, taskcatch-stt, taskcatch-postgres"
echo "Press Ctrl+C to exit."
echo "--------------------------------------------------------"

journalctl --user -f -u taskcatch-api -u taskcatch-stt -u taskcatch-postgres
