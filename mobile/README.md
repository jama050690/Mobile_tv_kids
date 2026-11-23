# Bolajon TV — mobil ilova (Flutter)

Bolalar uchun jonli TV: telefon/planshetda kanallar xuddi televizordagidek efirda — hamma bir vaqtda bir xil joyni ko'radi.

## Imkoniyatlar
- **Efir** — jonli pleer (HLS/MP4) + kanallar ro'yxati (hozir / keyingi), svayp bilan kanal almashtirish, to'liq ekran
- **Kanallar** — katalog, yosh bo'yicha filtr (0-3, 4-7, 8-12), sevimlilar
- **Dastur** — kunlik EPG (kecha … +5 kun), foydalanuvchi timezone'ida
- **Sozlamalar** — til (uz/ru/en), mintaqa, ota-ona nazorati (PIN, kunlik limit)
- Server soati bilan sinxron: pleer kerakli joydan boshlaydi, 4s'dan ortiq siljisa tuzatadi
- SSE (`/events`) — admin jadvalni o'zgartirsa ilova darhol yangilanadi

## Ishga tushirish
```bash
cd mobile
flutter pub get

# Production server bilan (standart: https://tv.jamshiddin.uz/api/v1)
flutter run

# Lokal backend bilan (Android emulator -> kompyuter = 10.0.2.2)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```
> Lokal `http://` uchun Android'da `android:usesCleartextTraffic="true"` kerak bo'ladi (faqat dev).

## Build
```bash
flutter build apk --release --dart-define=API_BASE_URL=https://tv.jamshiddin.uz/api/v1
flutter build appbundle --release      # Google Play
flutter build ipa --release            # iOS (macOS + Xcode)
```

## Tuzilma
```
lib/
  config.dart            API manzil, taymautlar
  models/models.dart     backend javoblari modellari
  services/              ApiClient, ServerClock, EventsService (SSE)
  state/                 SettingsStore (prefs), GuideStore (efir holati)
  screens/               onboarding, home_shell, live, catalog, schedule, settings
  widgets/               live_player, pin_dialog, umumiy widgetlar
  l10n/strings.dart      uz / ru / en tarjimalar
```
