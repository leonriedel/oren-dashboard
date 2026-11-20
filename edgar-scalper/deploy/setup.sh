#!/usr/bin/env bash
# One-time server setup (Ubuntu 24.04). Run as root:  bash setup.sh
set -euo pipefail
apt-get update -y
apt-get install -y ca-certificates curl git ufw
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
ufw allow OpenSSH && ufw --force enable          # only SSH is reachable from outside
cd ~
[ -d oren-dashboard ] || git clone https://github.com/leonriedel/oren-dashboard.git
cd oren-dashboard/edgar-scalper/deploy
mkdir -p state
[ -f gateway.env ] || cp gateway.env.example gateway.env
[ -f ../.env ] || touch ../.env
chmod 600 gateway.env ../.env
echo
echo "Next:"
echo "  nano ~/oren-dashboard/edgar-scalper/deploy/gateway.env   # Edgar IBKR username + password"
echo "  nano ~/oren-dashboard/edgar-scalper/.env                 # paste the .env from the OREN Mac"
echo "  cd ~/oren-dashboard/edgar-scalper/deploy && docker compose up -d --build"
echo "  docker compose logs -f edgar                             # watch Edgar"
