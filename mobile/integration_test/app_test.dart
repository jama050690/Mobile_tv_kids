// E2E test: ilovani real qurilma/simulyatorda ishga tushirib, REAL server bilan
// butun oqimni tekshiradi: onboarding -> Efir -> Kanallar -> Dastur -> Sozlamalar.
//
// Ishga tushirish (ilova toza o'rnatilgan bo'lishi kerak — onboarding'dan boshlanadi):
//   flutter test integration_test/app_test.dart -d <simulator/device id>
//
// Server manzili: lib/config.dart (default https://mobile-tv.jamshiddin.uz/api/v1)
// yoki --dart-define=API_BASE_URL=...
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:kids_tv/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  /// Video o'ynayotganda pumpAndSettle hech qachon tugamaydi —
  /// shuning uchun belgilangan vaqt davomida kadrlarni qo'lda "pump" qilamiz.
  Future<void> wait(WidgetTester t, int seconds) async {
    for (var i = 0; i < seconds * 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  /// Widget paydo bo'lguncha kutish (maksimum [seconds] soniya)
  Future<bool> waitFor(WidgetTester t, Finder f, {int seconds = 20}) async {
    for (var i = 0; i < seconds * 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
      if (f.evaluate().isNotEmpty) return true;
    }
    return false;
  }

  final noConnection = find.textContaining("aloqa yo'q");

  /// Pastki navigatsiya tugmasi ("Kanallar" sarlavhasi Efir ekranida ham bor — shuning uchun faqat NavigationBar ichidan)
  Finder tab(String label) => find.descendant(of: find.byType(NavigationBar), matching: find.text(label));

  testWidgets('To\'liq oqim real server bilan', (t) async {
    // 1) Ilovani ishga tushiramiz
    await app.main();
    await wait(t, 3);

    // 2) Onboarding — til tanlash
    expect(await waitFor(t, find.text('Davom etish')), isTrue, reason: 'Til tanlash ekrani chiqmadi');
    debugPrint('E2E: 1/6 til ekrani OK');
    await t.tap(find.text('Davom etish'));

    // 3) Onboarding — mintaqa: serverdan /regions va /regions/resolve yuklanadi
    expect(await waitFor(t, find.text('Boshlash')), isTrue);
    await wait(t, 4);
    expect(noConnection, findsNothing, reason: 'Mintaqa ekranida server xatosi');
    expect(find.byIcon(Icons.my_location_rounded), findsOneWidget, reason: 'Davlat avtomatik aniqlanmadi');
    debugPrint('E2E: 2/6 mintaqa avto-aniqlandi OK');
    await wait(t, 2);
    await t.tap(find.text('Boshlash'));

    // 4) Efir ekrani — /guide/now
    expect(await waitFor(t, find.text('Efir')), isTrue);
    await wait(t, 8);
    expect(noConnection, findsNothing, reason: 'Efir ekranida server xatosi');
    expect(find.textContaining('Multfilm Klassika'), findsWidgets, reason: 'Kanallar ro\'yxati kelmadi');
    debugPrint('E2E: 3/6 Efir (guide/now) OK');
    await wait(t, 10); // video o'ynashi uchun vaqt (skrinshot olinadi)

    // 5) Kanallar katalogi
    await t.tap(tab('Kanallar'));
    await wait(t, 6);
    expect(find.textContaining('Multfilm Klassika'), findsWidgets);
    debugPrint('E2E: 4/6 Kanallar OK');

    // 6) Dastur (EPG) — /channels/:ref/schedule
    await t.tap(tab('Dastur'));
    expect(await waitFor(t, find.textContaining('[DEMO]')), isTrue, reason: 'Dastur jadvali kelmadi');
    await wait(t, 6);
    debugPrint('E2E: 5/6 Dastur OK');

    // 7) Sozlamalar
    await t.tap(tab('Sozlamalar'));
    await wait(t, 6);
    // Server manzili ro'yxat pastida — ekranda bo'lmasligi mumkin, shuning uchun faqat log
    final host = find.textContaining('://');
    debugPrint('E2E: 6/6 Sozlamalar OK${host.evaluate().isNotEmpty ? ' (server: ${(host.evaluate().first.widget as Text).data})' : ''}');

    // Efirga qaytib, videoni yana ko'ramiz
    await t.tap(tab('Efir'));
    await wait(t, 8);
  });
}
