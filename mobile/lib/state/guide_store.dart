import 'dart:async';

import 'package:flutter/foundation.dart';

import '../config.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../services/events_service.dart';
import 'settings_store.dart';

/// Barcha kanallar va ularning hozirgi/keyingi dasturlari (GET /guide/now).
/// SSE hodisasi kelganda yoki eng yaqin dastur almashganda avtomatik yangilanadi.
class GuideStore extends ChangeNotifier {
  GuideStore({required this.api, required this.events, required this.settings}) {
    _eventsSub = events.stream.listen(_onEvent);
    settings.addListener(_onSettingsChanged);
    _tz = settings.timezone;
  }

  final ApiClient api;
  final EventsService events;
  final SettingsStore settings;

  StreamSubscription<AppEvent>? _eventsSub;
  Timer? _timer;
  Timer? _debounce;
  late String _tz;

  GuideNow? _guide;
  bool loading = false;
  Object? error;

  /// Har bir SSE hodisasida oshadi — pleer o'z kanalini qayta so'rashi uchun signal
  int revision = 0;
  String? lastEventChannelId;

  /// Kamida bir marta muvaffaqiyatli yuklangan
  bool get ready => _guide != null;

  List<NowState> get items => _guide?.channels ?? const [];
  List<Channel> get channels => items.map((e) => e.channel).toList();
  String get utcOffset => _guide?.utcOffset ?? '';

  // ---------------- Tanlangan kanal (Efir, Dastur ekranlari uchun umumiy) ----------------
  String? _selectedId;

  /// Tanlangan kanal; yo'q bo'lsa (yoki o'chirilgan bo'lsa) — oxirgi ko'rilgan yoki birinchi kanal
  Channel? get selected {
    final list = channels;
    if (list.isEmpty) return null;
    final id = _selectedId ?? settings.lastChannelId;
    return list.firstWhere((c) => c.id == id, orElse: () => list.first);
  }

  void select(String channelId) {
    if (_selectedId == channelId) return;
    _selectedId = channelId;
    settings.setLastChannel(channelId);
    notifyListeners();
  }

  /// Kanal almashtirish: +1 keyingi, -1 oldingi (aylanma, TV pulti kabi)
  void step(int delta) {
    final list = channels;
    final cur = selected;
    if (list.isEmpty || cur == null) return;
    final i = list.indexWhere((c) => c.id == cur.id);
    select(list[(i + delta) % list.length].id);
  }

  NowState? stateOf(String channelId) {
    for (final s in items) {
      if (s.channel.id == channelId) return s;
    }
    return null;
  }

  Future<void> refresh() async {
    loading = true;
    notifyListeners();
    try {
      _guide = await api.guideNow(tz: settings.timezone);
      error = null;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
      _scheduleNext();
      notifyListeners();
    }
  }

  /// Keyingi yangilanish: eng yaqin dastur almashishi yoki 60s (qaysi biri oldin)
  void _scheduleNext() {
    _timer?.cancel();
    var next = AppConfig.guideRefresh;
    if (error != null) {
      next = const Duration(seconds: 10);
    } else {
      for (final s in items) {
        final d = Duration(seconds: s.refreshInSec + 1);
        if (d < next) next = d;
      }
    }
    _timer = Timer(next, refresh);
  }

  void _onEvent(AppEvent e) {
    lastEventChannelId = e.channelId;
    revision++;
    // Bir nechta hodisa ketma-ket kelsa — bitta so'rov
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), refresh);
  }

  void _onSettingsChanged() {
    if (settings.timezone != _tz) {
      _tz = settings.timezone;
      refresh();
    }
  }

  /// Ilova fonga o'tganda — taymerlarni to'xtatamiz
  void pause() {
    _timer?.cancel();
    _debounce?.cancel();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _debounce?.cancel();
    _eventsSub?.cancel();
    settings.removeListener(_onSettingsChanged);
    super.dispose();
  }
}
