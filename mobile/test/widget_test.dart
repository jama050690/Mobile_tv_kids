import 'package:flutter_test/flutter_test.dart';
import 'package:kids_tv/l10n/strings.dart';
import 'package:kids_tv/models/models.dart';
import 'package:kids_tv/services/server_clock.dart';

void main() {
  test('Tarjimalar: barcha tillarda kalitlar bor', () {
    for (final lang in S.languages.keys) {
      expect(S(lang).t('appName'), isNotEmpty);
      expect(S(lang).t('today'), isNot('today'));
    }
  });

  test('AgeGroup API qiymatlari', () {
    expect(AgeGroup.values.map((e) => e.api), containsAll(['AGE_0_3', 'AGE_4_7', 'AGE_8_12', 'ALL']));
  });

  test('ServerClock: server vaqtiga sinxronlanadi', () {
    final clock = ServerClock();
    final local = DateTime.now().millisecondsSinceEpoch;
    // Server 1 soat oldinda, RTT 100ms
    clock.sync(local + 3600000, local - 100, local);
    expect((clock.nowMs() - (local + 3600000)).abs(), lessThan(1000));
  });
}
