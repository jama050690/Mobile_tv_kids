# Serverga o'rnatish (Ubuntu 22.04 / 24.04)

Bitta buyruq: Docker, `.env` (parollar avtomatik), SSL, admin panel, baza va birinchi admin.

## 1-usul: Mac'dan to'g'ridan-to'g'ri (GitHub shart emas)

```bash
cd Mobile_tv_kids
bash deploy/upload.sh root@SERVER_IP
```

Skript kodni `/opt/kidstv` ga yuboradi va `install.sh` ni ishga tushiradi.
Keyingi safar xuddi shu buyruq kodni yangilaydi (`update.sh`).

## 2-usul: GitHub orqali (serverda)

```bash
sudo git clone https://github.com/jama050690/Mobile_tv_kids.git /opt/kidstv
cd /opt/kidstv
sudo bash deploy/install.sh
```

Yangilash: `cd /opt/kidstv && sudo bash deploy/update.sh` (o'zi `git pull` qiladi).

## O'rnatishda beriladigan savollar

| Savol | Izoh |
|---|---|
| Domen | Masalan `tv.domen.uz`. Domen panelida **A-yozuv → server IP** bo'lishi kerak. Bo'sh qoldirilsa, panel `http://SERVER_IP` orqali ochiladi (HTTPS'siz, faqat test uchun) |
| SSL email | Let's Encrypt eslatmalari uchun |
| Admin email | Panelga kirish uchun. Parol avtomatik yaratiladi va oxirida ekranga chiqadi |
| Demo ma'lumot | `y` bo'lsa, 3 ta demo kanal va multfilmlar qo'shiladi |

## Talablar va to'qnashuvlar

- 80 va 443 portlar bo'sh bo'lishi kerak. Skript buni tekshiradi va band qilgan dasturni ko'rsatadi.
- **coturn**: odatda 3478/5349 portlarda ishlaydi, shuning uchun to'qnashmaydi. Agar `tls-listening-port=443` bo'lsa, 5349 ga o'tkazing.
- Postgres, Redis va API tashqariga ochilmaydi (`docker-compose.prod.yml`). Serverdagi boshqa Redis/Postgres bilan to'qnashmaydi.
- ufw yoqilgan bo'lsa, faqat 80/443 ochiladi. Boshqa qoidalarga tegilmaydi.
- RAM: kamida 1 GB (build vaqtida 2 GB tavsiya etiladi, kerak bo'lsa swap qo'shing).

## Foydali buyruqlar (`/opt/kidstv/backend` ichida)

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C ps                         # holat
$C logs -f api                # API loglari
$C logs -f nginx              # nginx loglari
$C restart api                # qayta ishga tushirish
$C exec postgres pg_dump -U kidstv kidstv | gzip > backup-$(date +%F).sql.gz   # zaxira nusxa
```

Sozlamalar: `/opt/kidstv/backend/.env`. O'zgartirgandan keyin `sudo bash deploy/update.sh` ni ishga tushiring.
