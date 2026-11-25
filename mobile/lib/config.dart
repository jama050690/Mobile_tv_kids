/// Ilova sozlamalari.
///
/// API manzili build paytida beriladi:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1   (Android emulator + lokal backend)
///   flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1  (iOS simulator + lokal backend)
/// Berilmasa — production server.
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mobile-tv.jamshiddin.uz/api/v1',
  );

  /// HTTP so'rov uchun maksimal kutish
  static const requestTimeout = Duration(seconds: 12);

  /// Kanal paneli (guide/now) qanchalik tez-tez yangilanadi (SSE bo'lsa ham zaxira sifatida)
  static const guideRefresh = Duration(seconds: 60);

  /// Svayp/raqam bilan kanal almashtirishda pleer yuklanishidan oldin kutish (tez varaqlashda ortiqcha so'rov bo'lmasin)
  static const channelSwitchDebounce = Duration(milliseconds: 350);

  /// TV ish vaqti (foydalanuvchi mintaqasi bo'yicha): 07:00 — 21:00.
  /// Qolgan vaqtda "Xayrli tun" ekrani (okean va baliqlar) chiqadi.
  static const tvOpenHour = 7;
  static const tvCloseHour = 21;

  /// Faqat test uchun: --dart-define=IGNORE_TV_HOURS=true — tungi rejim o'chadi
  static const ignoreTvHours = bool.fromEnvironment('IGNORE_TV_HOURS');
}
