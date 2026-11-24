#!/usr/bin/env bash
# =====================================================================
#  Kids TV — kodni Mac'dan serverga yuborish (GitHub'siz) va o'rnatish
#
#     bash deploy/upload.sh ubuntu@SERVER_IP                         # ~/.ssh kaliti bilan
#     SSH_KEY=~/keys/Keys.pem bash deploy/upload.sh ubuntu@SERVER_IP # .pem kalit bilan
#     bash deploy/upload.sh ubuntu@SERVER_IP /opt/kidstv             # boshqa papka
#
#  node_modules, dist, .env, sertifikatlar YUBORILMAYDI —
#  serverdagi .env / baza / sertifikatlar saqlanib qoladi.
# =====================================================================
set -euo pipefail

TARGET="${1:-}"
DIR="${2:-/opt/kidstv}"
[[ -n "$TARGET" ]] || { echo "Ishlatish: [SSH_KEY=kalit.pem] bash deploy/upload.sh user@SERVER_IP [/opt/kidstv]"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# SSH sozlamalari: kalit berilgan bo'lsa — shu kalit bilan ulanamiz
SSH_OPTS=(-o ServerAliveInterval=30)
if [[ -n "${SSH_KEY:-}" ]]; then
  [[ -f "$SSH_KEY" ]] || { echo "Kalit topilmadi: $SSH_KEY"; exit 1; }
  chmod 600 "$SSH_KEY" 2>/dev/null || true   # ssh ochiq huquqli kalitni rad etadi
  SSH_OPTS+=(-i "$SSH_KEY" -o IdentitiesOnly=yes)
fi
RSYNC_SSH="ssh $(printf '%q ' "${SSH_OPTS[@]}")"

echo "==> $TARGET:$DIR papkasi tayyorlanmoqda"
ssh "${SSH_OPTS[@]}" "$TARGET" "sudo mkdir -p '$DIR' && sudo chown \"\$(id -un)\" '$DIR'"

echo "==> Fayllar yuborilmoqda (rsync)"
# Tartib muhim: birinchi mos kelgan qoida ishlaydi (.env.example yuboriladi, .env — yo'q)
rsync -az --delete -e "$RSYNC_SSH" \
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
  --exclude '*.pem' \
  --exclude 'keys/' \
  --exclude 'mobile/' \
  "$ROOT/" "$TARGET:$DIR/"
# mobile/ — Flutter ilova serverga kerak emas (build bilan bir necha GB)

echo "==> Serverda o'rnatish / yangilash"
# -t: install.sh savollar beradi (domen, email) — interaktiv terminal kerak
ssh -t "${SSH_OPTS[@]}" "$TARGET" "cd '$DIR' && if sudo test -f backend/.env; then sudo bash deploy/update.sh; else sudo bash deploy/install.sh; fi"
