#!/usr/bin/env bash
# pull the newest Edgar code and restart:  bash update.sh
set -euo pipefail
cd ~/oren-dashboard && git pull
cd edgar-scalper/deploy && docker compose up -d --build edgar
docker compose logs --tail 30 edgar
