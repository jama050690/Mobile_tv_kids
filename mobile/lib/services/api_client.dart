import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../models/models.dart';
import 'server_clock.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Backend'ning ommaviy (login talab qilmaydigan) API'si.
/// Har bir javobdagi serverEpochMs orqali ilova soati server bilan sinxronlanadi.
class ApiClient {
  ApiClient({http.Client? client, required this.clock}) : _http = client ?? http.Client();

  final http.Client _http;
  final ServerClock clock;

  Uri _uri(String path, [Map<String, String?> query = const {}]) {
    final q = <String, String>{
      for (final e in query.entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return Uri.parse('${AppConfig.apiBaseUrl}$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<dynamic> _get(String path, [Map<String, String?> query = const {}]) async {
    final sentAt = DateTime.now().millisecondsSinceEpoch;
    final res = await _http
        .get(_uri(path, query), headers: const {'Accept': 'application/json'})
        .timeout(AppConfig.requestTimeout);
    final receivedAt = DateTime.now().millisecondsSinceEpoch;

    final body = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      final msg = body is Map && body['message'] != null ? body['message'].toString() : res.reasonPhrase ?? 'Xato';
      throw ApiException(res.statusCode, msg);
    }
    // Soat sinxronizatsiyasi: server vaqti ≈ so'rovning o'rtasi
    if (body is Map && body['serverEpochMs'] is num) {
      clock.sync((body['serverEpochMs'] as num).toInt(), sentAt, receivedAt);
    }
    return body;
  }

  /// Barcha kanallar: hozirgi va keyingi dastur (asosiy ekran)
  Future<GuideNow> guideNow({required String tz, String? ageGroup}) async =>
      GuideNow.fromJson(await _get('/guide/now', {'tz': tz, 'ageGroup': ageGroup}) as Map<String, dynamic>);

  /// Bitta kanal: hozirgi dastur + seek offset (pleer uchun)
  Future<NowState> channelNow(String ref, {required String tz}) async =>
      NowState.fromJson(await _get('/channels/${Uri.encodeComponent(ref)}/now', {'tz': tz}) as Map<String, dynamic>);

  /// Kanalning kunlik dasturi (EPG). date — foydalanuvchi kuni YYYY-MM-DD
  Future<ScheduleDay> schedule(String ref, {required String tz, String? date}) async => ScheduleDay.fromJson(
      await _get('/channels/${Uri.encodeComponent(ref)}/schedule', {'tz': tz, 'date': date}) as Map<String, dynamic>);

  Future<List<Region>> regions() async =>
      (await _get('/regions') as List).map((e) => Region.fromJson(e as Map<String, dynamic>)).toList();

  Future<ResolvedRegion> resolveRegion(String tz) async =>
      ResolvedRegion.fromJson(await _get('/regions/resolve', {'tz': tz}) as Map<String, dynamic>);

  /// Video ochilmadi — server URL'ni navbatdan tashqari tekshiradi. Xatolar e'tiborsiz qoldiriladi.
  Future<void> reportPlaybackError(String programId, String errorCode) async {
    try {
      await _http
          .post(
            _uri('/playback/report'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({
              'programId': programId,
              'errorCode': errorCode.length > 100 ? errorCode.substring(0, 100) : errorCode,
            }),
          )
          .timeout(AppConfig.requestTimeout);
    } catch (_) {}
  }
}
