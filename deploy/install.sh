#!/usr/bin/env bash
# =====================================================================
#  Kids TV — Ubuntu serverga o'rnatish (birinchi marta yoki qayta)
#
#  Ishlatish (serverda, loyiha papkasida):
#     sudo bash deploy/install.sh
#
#  Nima qiladi:
#   1) Docker + Compose o'rnatadi (yo'q bo'lsa)
#   2) backend/.env yaratadi — barcha parollar/secret'lar avtomatik generatsiya qilinadi
#   3) 80/443 portlar bandligini tekshiradi (coturn / boshqa nginx bilan to'qnashmasin)
#   4) Admin panelni build qiladi (Node serverga o'rnatilmaydi — docker ichida)
#   5) Domen bo'lsa — Let's Encrypt SSL sertifikat oladi + avtomatik yangilash (cron)
#   6) Postgres + Redis + API + Nginx'ni ishga tushiradi, migratsiyalar avtomatik
#   7) Birinchi super admin'ni yaratadi (seed) va login ma'lumotlarini chiqaradi
#
#  Qayta ishga tushirish xavfsiz: mavjud .env, sertifikat va baza saqlanadi.
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
ADMIN="$ROOT/admin"
ENV_FILE="$BACKEND/.env"
CREDS_FILE="$BACKEND/.admin-credentials"

info() { echo -e "\n\033[1;34m==>\033[0m \033[1m$*\033[0m"; }
ok()   { echo -e "    \033[32m✔\033[0m $*"; }
warn() { echo -e "    \033[33m⚠\033[0m $*"; }
die()  { echo -e "\n\033[1;31m✖ $*\033[0m\n" >&2; exit 1; }

# .env dan bitta qiymatni o'qish (source qilmasdan — xavfsizroq)
env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# PROXY_MODE=host → serverdagi tizim nginx'i ishlatiladi, API 127.0.0.1:API_HOST_PORT da ochiladi
compose() {
  local files=(-f docker-compose.yml -f docker-compose.prod.yml)
  [[ "$(env_get PROXY_MODE)" == "host" ]] && files+=(-f docker-compose.hostnginx.yml)
  (cd "$BACKEND" && docker compose "${files[@]}" "$@")
}

# 80-portni Docker'dan tashqaridagi nginx egallaganmi?
host_nginx_on_80() {
  local h; h="$(ss -ltnpH "( sport = :80 )" 2>/dev/null || true)"
  [[ -n "$h" ]] && ! grep -q docker-proxy <<<"$h" && grep -q '"nginx"' <<<"$h"
}

HOST_SITE=/etc/nginx/sites-available/kidstv.conf

# ---------------------------------------------------------------------
# 0. Tekshiruvlar
# ---------------------------------------------------------------------
[[ $EUID -eq 0 ]] || die "Root huquqi kerak:  sudo bash deploy/install.sh"
[[ -f "$BACKEND/docker-compose.yml" && -f "$ADMIN/package.json" ]] || die "Loyiha tuzilmasi topilmadi: $ROOT"
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  OS_NAME="${PRETTY_NAME:-unknown}"
  [[ "${ID:-}" == "ubuntu" || "${ID_LIKE:-}" == *debian* ]] || warn "Skript Ubuntu uchun yozilgan (sizda: $OS_NAME)"
fi

# ---------------------------------------------------------------------
# 1. Docker
# ---------------------------------------------------------------------
info "1/7 Docker"
if ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  apt-get update -qq && apt-get install -y -qq curl openssl ca-certificates
fi
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# RAM kam (<3 GB) va swap yo'q bo'lsa — 2 GB swap (build paytida xotira yetmay qolmasin)
MEM_MB="$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)"
if [[ "$MEM_MB" -lt 3000 && -z "$(swapon --show --noheadings)" && ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "2 GB swap qo'shildi (RAM: ${MEM_MB} MB)"
fi
docker compose version >/dev/null 2>&1 || apt-get install -y -qq docker-compose-plugin
ok "$(docker --version)"
ok "$(docker compose version)"

# ---------------------------------------------------------------------
# 2. .env
# ---------------------------------------------------------------------
info "2/7 Sozlamalar (backend/.env)"
if [[ -f "$ENV_FILE" ]]; then
  ok "Mavjud .env ishlatiladi (o'zgartirish uchun: nano $ENV_FILE)"
else
  echo "    Domen — masalan tv.sizningdomen.uz (DNS A-yozuvi shu server IP'siga qaragan bo'lishi kerak)."
  echo "    Domen bo'lmasa bo'sh qoldiring — panel http://SERVER_IP orqali ishlaydi (shifrlanmagan, test uchun)."
  read -rp "    Domen: " IN_DOMAIN
  IN_DOMAIN="$(echo "$IN_DOMAIN" | tr -d '[:space:]' | sed -E 's#^https?://##; s#/.*$##')"

  IN_LE_EMAIL=""
  if [[ -n "$IN_DOMAIN" ]]; then
    read -rp "    SSL sertifikat uchun email (Let's Encrypt eslatmalari): " IN_LE_EMAIL
    [[ "$IN_LE_EMAIL" == *@* ]] || die "Email noto'g'ri"
  fi

  read -rp "    Admin panel login email [admin@kidstv.local]: " IN_ADMIN_EMAIL
  IN_ADMIN_EMAIL="${IN_ADMIN_EMAIL:-admin@kidstv.local}"

  read -rp "    Demo kanallar va multfilmlar qo'shilsinmi? (y/N): " IN_DEMO
  [[ "$IN_DEMO" =~ ^[Yy] ]] && IN_DEMO=true || IN_DEMO=false

  # Kuchli tasodifiy qiymatlar (hex — URL va .env uchun xavfsiz belgilar)
  PG_PASS="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  # Parol qoidasi: kamida 10 belgi, katta + kichik harf + raqam
  ADMIN_PASS="Kt$(openssl rand -hex 8)Z9"

  if [[ -n "$IN_DOMAIN" ]]; then
    COOKIE_SECURE=true; NGINX_TEMPLATES=./nginx/templates
  else
    COOKIE_SECURE=false; NGINX_TEMPLATES=./nginx/templates-http
  fi

  umask 077
  cat > "$ENV_FILE" <<EOF
# Avtomatik yaratildi: $(date -u +%Y-%m-%dT%H:%M:%SZ)  —  deploy/install.sh
NODE_ENV=production
PORT=3000
DEFAULT_TIMEZONE=Asia/Tashkent
TRUST_PROXY=1
SWAGGER_ENABLED=false

POSTGRES_USER=kidstv
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=kidstv
# docker-compose bu qiymatni ichki manzil bilan almashtiradi
DATABASE_URL=postgresql://kidstv:$PG_PASS@postgres:5432/kidstv?schema=public
REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=$JWT_SECRET
JWT_ACCESS_TTL_SEC=900
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=$COOKIE_SECURE
COOKIE_DOMAIN=

# Panel API bilan bitta domenda — CORS kerak emas
CORS_ORIGINS=
RATE_LIMIT_PER_MINUTE=120

ALLOW_HTTP_MEDIA=false
ALLOWED_MEDIA_HOSTS=
URL_CHECK_TIMEOUT_MS=8000
URL_CHECK_CRON_ENABLED=true

SEED_ADMIN_EMAIL=$IN_ADMIN_EMAIL
SEED_ADMIN_PASSWORD=$ADMIN_PASS
SEED_DEMO_DATA=$IN_DEMO

DOMAIN=$IN_DOMAIN
LETSENCRYPT_EMAIL=$IN_LE_EMAIL
NGINX_TEMPLATES=$NGINX_TEMPLATES
EOF
  printf 'email=%s\npassword=%s\n' "$IN_ADMIN_EMAIL" "$ADMIN_PASS" > "$CREDS_FILE"
  umask 022
  chmod 600 "$ENV_FILE" "$CREDS_FILE"
  ok ".env yaratildi (parollar avtomatik, fayl huquqi 600)"
fi

DOMAIN="$(env_get DOMAIN)"
LE_EMAIL="$(env_get LETSENCRYPT_EMAIL)"

# Eski .env'da NGINX_TEMPLATES bo'lmasa — DOMAIN bo'yicha aniqlaymiz
if [[ -z "$(env_get NGINX_TEMPLATES)" ]]; then
  if [[ -n "$DOMAIN" && "$DOMAIN" != "api.example.com" ]]; then echo "NGINX_TEMPLATES=./nginx/templates" >> "$ENV_FILE"
  else echo "NGINX_TEMPLATES=./nginx/templates-http" >> "$ENV_FILE"; fi
fi
[[ "$DOMAIN" == "api.example.com" ]] && die ".env dagi DOMAIN namunaviy qiymatda qolgan — o'zgartiring yoki bo'sh qoldiring"

# Serverda boshqa saytlar bilan tizim nginx'i ishlayapti → unga qo'shilamiz (to'xtatmaymiz)
if [[ -z "$(env_get PROXY_MODE)" ]] && host_nginx_on_80; then
  [[ -n "$DOMAIN" ]] || die "Serverda tizim nginx'i ishlayapti (80-port). Bu rejimda domen shart — .env dagi DOMAIN ni to'ldiring."
  # API uchun birinchi bo'sh portni tanlaymiz (3020 dan) — serverdagi boshqa ilovalar bilan to'qnashmasin
  FREE_PORT=""
  for cand in $(seq 3020 3099); do
    [[ -z "$(ss -ltnH "( sport = :$cand )" 2>/dev/null)" ]] && { FREE_PORT=$cand; break; }
  done
  [[ -n "$FREE_PORT" ]] || die "3020-3099 oralig'ida bo'sh port topilmadi"
  printf 'PROXY_MODE=host\nAPI_HOST_PORT=%s\n' "$FREE_PORT" >> "$ENV_FILE"
  ok "Tizim nginx'i topildi — Kids TV unga alohida sayt sifatida qo'shiladi (boshqa saytlarga tegilmaydi)"
fi
PROXY_MODE="$(env_get PROXY_MODE)"
API_HOST_PORT="$(env_get API_HOST_PORT)"; API_HOST_PORT="${API_HOST_PORT:-3020}"

if [[ "$PROXY_MODE" == "host" ]]; then
  MODE=host
  [[ "$(env_get COOKIE_SECURE)" == "true" ]] || sed -i 's#^COOKIE_SECURE=.*#COOKIE_SECURE=true#' "$ENV_FILE"
elif [[ -n "$DOMAIN" ]]; then
  MODE=https
  [[ "$(env_get NGINX_TEMPLATES)" == "./nginx/templates" ]] || sed -i 's#^NGINX_TEMPLATES=.*#NGINX_TEMPLATES=./nginx/templates#' "$ENV_FILE"
  [[ "$(env_get COOKIE_SECURE)" == "true" ]] || sed -i 's#^COOKIE_SECURE=.*#COOKIE_SECURE=true#' "$ENV_FILE"
else
  MODE=http
  [[ "$(env_get COOKIE_SECURE)" == "false" ]] || sed -i 's#^COOKIE_SECURE=.*#COOKIE_SECURE=false#' "$ENV_FILE"
fi
ok "Rejim: $MODE ${DOMAIN:+($DOMAIN)}"

# ---------------------------------------------------------------------
# 3. Portlar
# ---------------------------------------------------------------------
info "3/7 Portlar"
PORTS=(80); [[ $MODE != http ]] && PORTS+=(443)

if [[ $MODE == host ]]; then
  # 80/443 tizim nginx'iniki — bu kutilgan holat. Faqat API porti bo'shligini tekshiramiz.
  command -v nginx >/dev/null && [[ -d /etc/nginx/sites-enabled ]] \
    || die "Tizim nginx'i /etc/nginx/sites-enabled tuzilmasida emas — qo'lda sozlash kerak"
  holder="$(ss -ltnpH "( sport = :$API_HOST_PORT )" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && ! grep -q docker-proxy <<<"$holder"; then
    echo "$holder" | sed 's/^/      /'
    die "$API_HOST_PORT-port band. .env dagi API_HOST_PORT ni boshqa bo'sh portga o'zgartiring (masalan 3021)."
  fi
  ok "80/443 — tizim nginx'i, API → 127.0.0.1:$API_HOST_PORT"
  PORTS_TO_CHECK=()
else
  PORTS_TO_CHECK=("${PORTS[@]}")
fi

for p in "${PORTS_TO_CHECK[@]}"; do
  holder="$(ss -ltnpH "( sport = :$p )" 2>/dev/null || true)"
  if [[ -z "$holder" ]]; then ok "$p bo'sh"
  elif grep -q docker-proxy <<<"$holder"; then ok "$p — docker (bizning nginx)"
  else
    echo "$holder" | sed 's/^/      /'
    die "$p-port boshqa dastur tomonidan band (yuqorida). Uni to'xtating yoki boshqa portga o'tkazing.
    Masalan tizim nginx'i:  systemctl disable --now nginx
    coturn 443 da bo'lsa: /etc/turnserver.conf dagi tls-listening-port ni 5349 ga o'zgartiring."
  fi
done

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  for p in "${PORTS[@]}"; do ufw allow "$p/tcp" >/dev/null; done
  ok "ufw: ${PORTS[*]}/tcp ochildi (boshqa qoidalar, jumladan coturn, o'zgartirilmadi)"
fi

# ---------------------------------------------------------------------
# 4. Admin panel build
# ---------------------------------------------------------------------
info "4/7 Admin panel build"
docker run --rm -v "$ADMIN":/app -w /app node:22-alpine \
  sh -c "npm ci --no-audit --no-fund --loglevel=error && npm run build" | tail -5
[[ -f "$ADMIN/dist/index.html" ]] || die "Admin panel build bo'lmadi"
ok "admin/dist tayyor"

# ---------------------------------------------------------------------
# 5. SSL sertifikat
# ---------------------------------------------------------------------
info "5/7 SSL"
mkdir -p "$BACKEND/nginx/certbot/conf" "$BACKEND/nginx/certbot/www"

# Tizim nginx'iga sayt yozish: shablondan o'zgaruvchilarni qo'yib, nginx -t bilan tekshirib, reload
install_host_site() {
  sed -e "s#__DOMAIN__#$DOMAIN#g" \
      -e "s#__API_PORT__#$API_HOST_PORT#g" \
      -e "s#__ADMIN_ROOT__#$ADMIN/dist#g" \
      "$ROOT/deploy/nginx-host.conf.template" > "$HOST_SITE"
  ln -sf "$HOST_SITE" /etc/nginx/sites-enabled/kidstv.conf
  if ! nginx -t 2>/tmp/kidstv-nginx-test.log; then
    cat /tmp/kidstv-nginx-test.log
    rm -f /etc/nginx/sites-enabled/kidstv.conf   # boshqa saytlar buzilmasin
    die "Nginx konfiguratsiyasida xato (yuqorida). Kids TV sayti o'chirildi, boshqa saytlar ishlashda davom etadi."
  fi
  systemctl reload nginx
}

if [[ $MODE == host ]]; then
  # Panel fayllarini www-data o'qiy olishi kerak
  chmod o+rx "$ROOT" "$ADMIN" "$ADMIN/dist"
  if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    ok "Sertifikat mavjud"
  else
    resolved="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
    [[ -n "$resolved" ]] || die "$DOMAIN DNS'da topilmadi. A-yozuv qo'shilganiga 15-60 daqiqa kuting va qayta ishga tushiring."
    ok "$DOMAIN -> $resolved"
    [[ -n "$LE_EMAIL" ]] || die ".env da LETSENCRYPT_EMAIL bo'sh"
    command -v certbot >/dev/null || apt-get install -y -qq certbot

    # Vaqtinchalik: sertifikat yo'q, shuning uchun faqat HTTP sayt (ACME tekshiruvi uchun)
    mkdir -p /var/www/certbot
    cat > "$HOST_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
    ln -sf "$HOST_SITE" /etc/nginx/sites-enabled/kidstv.conf
    nginx -t >/dev/null 2>&1 || { rm -f /etc/nginx/sites-enabled/kidstv.conf; nginx -t; die "Nginx xatosi"; }
    systemctl reload nginx

    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
      --email "$LE_EMAIL" --agree-tos --no-eff-email --non-interactive \
      || die "Sertifikat olinmadi. DNS A-yozuvi aynan shu serverga qaraganini va 80-port ochiqligini tekshiring."
    ok "Sertifikat olindi"
  fi

  # Yangilash: Ubuntu certbot paketi o'z timer'i bilan yangilaydi; keyin nginx reload
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/kidstv-nginx-reload.sh
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/kidstv-nginx-reload.sh
  rm -f /etc/cron.d/kidstv-certbot
  ok "Avtomatik yangilash: certbot.timer"

  install_host_site
  ok "Nginx sayti: $HOST_SITE"
elif [[ $MODE == https ]]; then
  if [[ -f "$BACKEND/nginx/certbot/conf/live/$DOMAIN/fullchain.pem" ]]; then
    ok "Sertifikat mavjud"
  else
    resolved="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
    [[ -n "$resolved" ]] || die "$DOMAIN DNS'da topilmadi. Domen panelida A-yozuv qo'shing (server IP) va 5-10 daqiqa kuting."
    ok "$DOMAIN -> $resolved"
    [[ -n "$LE_EMAIL" ]] || die ".env da LETSENCRYPT_EMAIL bo'sh"
    compose stop nginx >/dev/null 2>&1 || true   # certbot standalone 80-portni egallaydi
    compose --profile certbot run --rm --service-ports certbot \
      || die "Sertifikat olinmadi. DNS A-yozuvi aynan shu serverga qaraganini va 80-port internetdan ochiqligini tekshiring."
    ok "Sertifikat olindi"
  fi

  # Avtomatik yangilash: har dushanba 03:17
  cat > /etc/cron.d/kidstv-certbot <<EOF
# Kids TV — Let's Encrypt sertifikatini yangilash (deploy/install.sh yaratgan)
17 3 * * 1 root cd $BACKEND && docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile certbot run --rm --entrypoint "certbot renew --webroot -w /var/www/certbot --quiet" certbot && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx nginx -s reload >> /var/log/kidstv-certbot.log 2>&1
EOF
  chmod 644 /etc/cron.d/kidstv-certbot
  ok "Avtomatik yangilash: /etc/cron.d/kidstv-certbot"
else
  warn "Domen yo'q — HTTPS o'chiq (faqat test uchun)"
fi

# ---------------------------------------------------------------------
# 6. Ishga tushirish
# ---------------------------------------------------------------------
info "6/7 Konteynerlar (birinchi build 3-5 daqiqa)"
PROFILES=(--profile full); [[ $MODE != host ]] && PROFILES+=(--profile proxy)
compose "${PROFILES[@]}" up -d --build --remove-orphans

echo -n "    API kutilmoqda "
for i in $(seq 1 60); do
  if compose exec -T api wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then echo; ok "API ishlayapti"; break; fi
  echo -n "."; sleep 3
  if [[ $i -eq 60 ]]; then echo; compose logs --tail=50 api; die "API ishga tushmadi (yuqoridagi log)"; fi
done
if [[ $MODE == host ]]; then
  curl -fsS "http://127.0.0.1:$API_HOST_PORT/api/v1/health" >/dev/null && ok "Tizim nginx'i → API ulanishi ishlayapti" \
    || warn "127.0.0.1:$API_HOST_PORT javob bermadi — compose logs api ni tekshiring"
else
  compose exec -T nginx nginx -t >/dev/null 2>&1 && ok "Nginx konfiguratsiyasi to'g'ri" || { compose logs --tail=30 nginx; die "Nginx xatosi"; }
fi

# ---------------------------------------------------------------------
# 7. Seed (birinchi admin)
# ---------------------------------------------------------------------
info "7/7 Birinchi administrator"
compose exec -T api node dist/database/seed.js | sed 's/^/    /'

# ---------------------------------------------------------------------
URL="http://$(hostname -I | awk '{print $1}')"
[[ $MODE != http ]] && URL="https://$DOMAIN"
echo
echo -e "\033[1;32m================ TAYYOR ================\033[0m"
echo "  Admin panel:  $URL/"
echo "  API:          $URL/api/v1"
echo "  Health:       $URL/api/v1/health"
if [[ -f "$CREDS_FILE" ]]; then
  echo "  Login:        $(grep ^email= "$CREDS_FILE" | cut -d= -f2)"
  echo "  Parol:        $(grep ^password= "$CREDS_FILE" | cut -d= -f2)"
  echo "  (saqlangan:   $CREDS_FILE — kirgandan keyin parolni panelda almashtirib, faylni o'chiring)"
fi
echo
[[ $MODE == host ]] && echo "  Nginx sayti:  $HOST_SITE (boshqa saytlaringiz o'zgarmadi)"
echo "  Loglar:       cd $BACKEND && docker compose logs -f api"
echo "  Yangilash:    sudo bash $ROOT/deploy/update.sh"
echo -e "\033[1;32m========================================\033[0m"
