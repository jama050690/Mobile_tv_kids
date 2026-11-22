#!/usr/bin/env bash
# =====================================================================
#  Kids TV — serverdagi loyihani yangilash
#     sudo bash deploy/update.sh
#  1) git pull (agar git orqali o'rnatilgan bo'lsa)  2) panel build
#  3) API qayta build + ishga tushirish (migratsiyalar avtomatik)  4) tekshiruv
#  Baza, .env va sertifikatlar saqlanadi.
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
ADMIN="$ROOT/admin"

info() { echo -e "\n\033[1;34m==>\033[0m \033[1m$*\033[0m"; }
die()  { echo -e "\n\033[1;31m✖ $*\033[0m\n" >&2; exit 1; }
compose() { (cd "$BACKEND" && docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"); }

[[ $EUID -eq 0 ]] || die "sudo bash deploy/update.sh"
[[ -f "$BACKEND/.env" ]] || die "backend/.env yo'q — avval: sudo bash deploy/install.sh"

if [[ -d "$ROOT/.git" ]]; then
  info "Kod yangilanmoqda (git pull)"
  git -C "$ROOT" config --global --add safe.directory "$ROOT" 2>/dev/null || true
  git -C "$ROOT" pull --ff-only
fi

info "Admin panel build"
docker run --rm -v "$ADMIN":/app -w /app node:22-alpine \
  sh -c "npm ci --no-audit --no-fund --loglevel=error && npm run build" | tail -3

info "API build va qayta ishga tushirish"
compose --profile full --profile proxy up -d --build --remove-orphans
compose exec -T nginx nginx -s reload >/dev/null 2>&1 || true

echo -n "    API kutilmoqda "
for i in $(seq 1 60); do
  if compose exec -T api wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then echo " ✔"; break; fi
  echo -n "."; sleep 3
  [[ $i -eq 60 ]] && { echo; compose logs --tail=50 api; die "API ishga tushmadi"; }
done

docker image prune -f >/dev/null
info "Yangilandi ✔"
compose ps
