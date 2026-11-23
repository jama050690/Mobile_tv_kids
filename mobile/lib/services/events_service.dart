import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// Serverdan kelgan hodisa: schedule.updated, channels.changed, channel.updated, program.updated
class AppEvent {
  AppEvent(this.type, this.data);
  final String type;
  final Map<String, dynamic> data;
  String? get channelId => data['channelId'] as String?;
}

/// Server-Sent Events (GET /events) — admin jadvalni o'zgartirsa ilova darhol yangilanadi.
/// Ulanish uzilsa avtomatik qayta ulanadi (1s, 2s, 4s ... 30s).
class EventsService {
  final _controller = StreamController<AppEvent>.broadcast();
  http.Client? _client;
  StreamSubscription<String>? _sub;
  Timer? _retryTimer;
  Timer? _watchdog;
  int _attempt = 0;
  bool _running = false;

  Stream<AppEvent> get stream => _controller.stream;

  void start() {
    if (_running) return;
    _running = true;
    _connect();
  }

  /// Ilova fonga o'tganda — batareya va trafikni tejash uchun
  void stop() {
    _running = false;
    _retryTimer?.cancel();
    _watchdog?.cancel();
    _sub?.cancel();
    _client?.close();
    _sub = null;
    _client = null;
  }

  Future<void> _connect() async {
    if (!_running) return;
    _client?.close();
    final client = http.Client();
    _client = client;
    try {
      final req = http.Request('GET', Uri.parse('${AppConfig.apiBaseUrl}/events'))
        ..headers['Accept'] = 'text/event-stream'
        ..headers['Cache-Control'] = 'no-cache';
      final res = await client.send(req).timeout(AppConfig.requestTimeout);
      if (res.statusCode != 200) throw Exception('SSE ${res.statusCode}');
      _attempt = 0;
      _kickWatchdog();

      String? eventType;
      final dataLines = <String>[];
      _sub = res.stream.transform(utf8.decoder).transform(const LineSplitter()).listen(
        (line) {
          _kickWatchdog();
          if (line.isEmpty) {
            // Bo'sh qator — hodisa tugadi
            if (dataLines.isNotEmpty) _emit(eventType ?? 'message', dataLines.join('\n'));
            eventType = null;
            dataLines.clear();
          } else if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.add(line.substring(5).trimLeft());
          }
        },
        onError: (_) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _emit(String type, String raw) {
    if (type == 'ping') return;
    Map<String, dynamic> data = const {};
    try {
      final d = jsonDecode(raw);
      if (d is Map<String, dynamic>) data = d;
    } catch (_) {}
    _controller.add(AppEvent(type, data));
  }

  /// Server har 25s da ping yuboradi. 70s jim bo'lsa — ulanish "osilib" qolgan, qayta ulanamiz.
  void _kickWatchdog() {
    _watchdog?.cancel();
    _watchdog = Timer(const Duration(seconds: 70), _scheduleReconnect);
  }

  void _scheduleReconnect() {
    _sub?.cancel();
    _sub = null;
    _watchdog?.cancel();
    if (!_running) return;
    _retryTimer?.cancel();
    final delay = Duration(seconds: [1, 2, 4, 8, 16, 30][_attempt.clamp(0, 5)]);
    _attempt++;
    _retryTimer = Timer(delay, _connect);
  }

  void dispose() {
    stop();
    _controller.close();
  }
}
