#!/usr/bin/env bash
# =====================================================================
#  Kids TV — kodni Mac'dan serverga yuborish (GitHub'siz) va o'rnatish
#
#     bash deploy/upload.sh root@SERVER_IP            # yuborish + install/update
#     bash deploy/upload.sh ubuntu@SERVER_IP /opt/kidstv
#
#  node_modules, dist, .env, sertifikatlar YUBORILMAYDI —
#  serverdagi .env / baza / sertifikatlar saqlanib qoladi.
# =====================================================================
set -euo pipefail

TARGET="${1:-}"
DIR="${2:-/opt/kidstv}"
[[ -n "$TARGET" ]] || { echo "Ishlatish: bash deploy/upload.sh user@SERVER_IP [/opt/kidstv]"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> $TARGET:$DIR papkasi tayyorlanmoqda"
ssh "$TARGET" "sudo mkdir -p '$DIR' && sudo chown \"\$(id -un)\" '$DIR'"

echo "==> Fayllar yuborilmoqda (rsync)"
# Tartib muhim: birinchi mos kelgan qoida ishlaydi (.env.example yuboriladi, .env — yo'q)
rsync -az --delete \
  --include '.env.example' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '*.tsbuildinfo' \
  --exclude '.admin-credentials' \
  --exclude 'backend/nginx/certbot/' \
  --exclude '.DS_Store' \
  "$ROOT/" "$TARGET:$DIR/"

echo "==> Serverda o'rnatish / yangilash"
# -t: install.sh savollar beradi (domen, email) — interaktiv terminal kerak
ssh -t "$TARGET" "cd '$DIR' && if [ -f backend/.env ]; then sudo bash deploy/update.sh; else sudo bash deploy/install.sh; fi"
