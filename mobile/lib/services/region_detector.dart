import 'package:flutter_timezone/flutter_timezone.dart';

import '../state/settings_store.dart';
import 'api_client.dart';

/// Davlat va vaqt mintaqasini AVTOMATIK aniqlash (foydalanuvchi qo'lda tanlamaydi).
///
/// Qanday ishlaydi:
///  1) Telefon o'z vaqt mintaqasini mobil operator signalidan (NITZ) yoki
///     tarmoqdan avtomatik o'rnatadi. Biz shu IANA timezone'ni olamiz (masalan "Asia/Tashkent").
///  2) Backend `/regions/resolve?tz=...` orqali bu zona qaysi davlatga tegishli ekanini aniqlaymiz.
///  3) Natijani SettingsStore'ga yozamiz — efir jadvali shu zonada ko'rsatiladi.
///
/// Ilova har ochilganda va fondan qaytganda qayta chaqiriladi: telefon boshqa davlatga
/// olib borilsa (yangi operator signali), mintaqa o'zi yangilanadi.
class RegionDetector {
  RegionDetector({required this.api, required this.settings});

  final ApiClient api;
  final SettingsStore settings;

  static const _fallbackTz = 'Asia/Tashkent';

  /// Ayni paytda ketayotgan aniqlash — parallel chaqiruvlar shu bitta natijani kutadi
  Future<void>? _pending;

  Future<void> detect() => _pending ??= _run().whenComplete(() => _pending = null);

  Future<void> _run() async {
    // 1) Qurilma timezone'i (telefon signali bo'yicha o'rnatilgan)
    String tz;
    try {
      tz = (await FlutterTimezone.getLocalTimezone()).identifier;
    } catch (_) {
      tz = settings.timezone.isNotEmpty ? settings.timezone : _fallbackTz;
    }

    // 2) Davlatni server orqali aniqlash; server javob bermasa — faqat timezone bilan davom etamiz
    String? country;
    try {
      country = (await api.resolveRegion(tz)).regionCode;
    } catch (_) {
      // Zona o'zgarmagan bo'lsa, oldingi davlat kodi saqlanib qoladi
      country = tz == settings.timezone ? settings.country : null;
    }

    // 3) Faqat o'zgargan bo'lsa yozamiz (keraksiz qayta yuklashlarsiz)
    if (tz != settings.timezone || country != settings.country) {
      await settings.setRegion(timezone: tz, country: country);
    }
  }
}
