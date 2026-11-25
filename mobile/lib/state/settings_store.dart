import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/strings.dart';

/// Foydalanuvchi sozlamalari (qurilmada saqlanadi): til, mintaqa, sevimlilar, ota-ona nazorati.
class SettingsStore extends ChangeNotifier {
  SettingsStore(this._prefs) {
    _rollWatchDay();
  }

  final SharedPreferences _prefs;

  // ---- Kalitlar ----
  static const _kOnboarded = 'onboarded';
  static const _kLang = 'lang';
  static const _kTz = 'tz';
  static const _kCountry = 'country';
  static const _kFavorites = 'favorites';
  static const _kLastChannel = 'lastChannel';
  static const _kMuted = 'muted';
  static const _kPin = 'pin';
  static const _kLimit = 'limitMinutes';
  static const _kWatchedDay = 'watchedDay';
  static const _kWatchedSec = 'watchedSec';
  static const _kChildName = 'childName';
  static const _kChildAge = 'childAge';

  static Future<SettingsStore> load() async => SettingsStore(await SharedPreferences.getInstance());

  // ---- Asosiy ----
  bool get onboarded => _prefs.getBool(_kOnboarded) ?? false;
  String get lang => _prefs.getString(_kLang) ?? 'uz';
  S get s => S(lang);

  /// IANA timezone — efir vaqti shu zonada ko'rsatiladi
  String get timezone => _prefs.getString(_kTz) ?? 'Asia/Tashkent';
  String? get country => _prefs.getString(_kCountry);

  Future<void> setLang(String v) async {
    await _prefs.setString(_kLang, v);
    notifyListeners();
  }

  Future<void> setRegion({required String timezone, String? country}) async {
    await _prefs.setString(_kTz, timezone);
    if (country == null) {
      await _prefs.remove(_kCountry);
    } else {
      await _prefs.setString(_kCountry, country);
    }
    notifyListeners();
  }

  Future<void> completeOnboarding() async {
    await _prefs.setBool(_kOnboarded, true);
    notifyListeners();
  }

  // ---- Bolajon: ism va yosh (onboarding'da so'raladi) ----
  String get childName => (_prefs.getString(_kChildName) ?? '').trim();
  int? get childAge => _prefs.getInt(_kChildAge);
  bool get hasChild => childName.isNotEmpty && childAge != null;

  /// Xabarlarda murojaat: ism bo'lmasa — "bolajon"
  String get displayName => childName.isNotEmpty ? childName : s.t('kid');

  Future<void> setChild({required String name, required int age}) async {
    await _prefs.setString(_kChildName, name.trim());
    await _prefs.setInt(_kChildAge, age);
    notifyListeners();
  }

  // ---- Sevimlilar ----
  Set<String> get favorites => (_prefs.getStringList(_kFavorites) ?? const []).toSet();
  bool isFavorite(String channelId) => favorites.contains(channelId);

  Future<void> toggleFavorite(String channelId) async {
    final f = favorites;
    f.contains(channelId) ? f.remove(channelId) : f.add(channelId);
    await _prefs.setStringList(_kFavorites, f.toList());
    notifyListeners();
  }

  // ---- Pleer ----
  String? get lastChannelId => _prefs.getString(_kLastChannel);
  Future<void> setLastChannel(String id) => _prefs.setString(_kLastChannel, id);

  bool get muted => _prefs.getBool(_kMuted) ?? false;
  Future<void> setMuted(bool v) async {
    await _prefs.setBool(_kMuted, v);
    notifyListeners();
  }

  // ---- Ota-ona nazorati ----
  bool get hasPin => (_prefs.getString(_kPin) ?? '').isNotEmpty;
  bool checkPin(String pin) => _prefs.getString(_kPin) == pin;

  Future<void> setPin(String? pin) async {
    if (pin == null || pin.isEmpty) {
      await _prefs.remove(_kPin);
    } else {
      await _prefs.setString(_kPin, pin);
    }
    notifyListeners();
  }

  /// Kunlik limit (daqiqa). 0 — cheklovsiz.
  int get limitMinutes => _prefs.getInt(_kLimit) ?? 0;
  Future<void> setLimitMinutes(int v) async {
    await _prefs.setInt(_kLimit, v);
    notifyListeners();
  }

  int get watchedSecToday {
    _rollWatchDay();
    return _prefs.getInt(_kWatchedSec) ?? 0;
  }

  bool get timeIsUp => limitMinutes > 0 && watchedSecToday >= limitMinutes * 60;

  /// Pleer har [sec] soniya ko'rilganini qo'shib boradi
  Future<void> addWatched(int sec) async {
    _rollWatchDay();
    final wasUp = timeIsUp;
    await _prefs.setInt(_kWatchedSec, (_prefs.getInt(_kWatchedSec) ?? 0) + sec);
    // Faqat limit tugagan paytda ekranni qayta chizamiz (har soniyada emas)
    if (!wasUp && timeIsUp) notifyListeners();
  }

  /// Ota-ona PIN bilan bugungi hisobni nolga tushiradi
  Future<void> resetWatchedToday() async {
    await _prefs.setInt(_kWatchedSec, 0);
    notifyListeners();
  }

  /// Yangi kun boshlansa ko'rilgan vaqt nolga tushadi
  void _rollWatchDay() {
    final now = DateTime.now();
    final today = '${now.year}-${now.month}-${now.day}';
    if (_prefs.getString(_kWatchedDay) != today) {
      _prefs.setString(_kWatchedDay, today);
      _prefs.setInt(_kWatchedSec, 0);
    }
  }
}
