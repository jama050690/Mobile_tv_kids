/// Qurilma soati noto'g'ri bo'lishi mumkin (bolalar planshetida ko'p uchraydi).
/// "Jonli efir" barcha foydalanuvchida bir xil bo'lishi uchun server vaqtidan foydalanamiz:
///   offset = serverTime - deviceTime   (so'rov yo'lidagi kechikishning yarmi hisobga olinadi)
class ServerClock {
  int _offsetMs = 0;
  int _bestRttMs = 1 << 30;
  DateTime? _syncedAt;

  /// [serverMs] — javobdagi serverEpochMs; [sentAt]/[receivedAt] — qurilma vaqti (ms)
  void sync(int serverMs, int sentAt, int receivedAt) {
    final rtt = receivedAt - sentAt;
    // Eng tez javob eng aniq. Lekin 10 daqiqadan eski sinxronni yangilaymiz (soat siljishi mumkin).
    final stale = _syncedAt == null || DateTime.now().difference(_syncedAt!) > const Duration(minutes: 10);
    if (rtt <= _bestRttMs || stale) {
      _bestRttMs = rtt;
      _offsetMs = serverMs + rtt ~/ 2 - receivedAt;
      _syncedAt = DateTime.now();
    }
  }

  /// Server bo'yicha hozirgi vaqt (ms)
  int nowMs() => DateTime.now().millisecondsSinceEpoch + _offsetMs;

  DateTime now() => DateTime.fromMillisecondsSinceEpoch(nowMs(), isUtc: true);

  int get offsetMs => _offsetMs;
}
