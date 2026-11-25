import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'screens/home_shell.dart';
import 'screens/onboarding_screen.dart';
import 'services/api_client.dart';
import 'services/events_service.dart';
import 'services/server_clock.dart';
import 'state/guide_store.dart';
import 'state/settings_store.dart';
import 'theme.dart';
import 'widgets/night_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // 1) Tizim panellari — shaffof, qorong'i fon ustida
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // 2) Saqlangan sozlamalar (til, timezone, sevimlilar, PIN...)
  final settings = await SettingsStore.load();

  // 3) Servislar: server soati -> API -> SSE -> umumiy holat
  final clock = ServerClock();
  final api = ApiClient(clock: clock);
  final events = EventsService();
  final guide = GuideStore(api: api, events: events, settings: settings);

  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider.value(value: settings),
      Provider.value(value: clock),
      Provider.value(value: api),
      Provider.value(value: events),
      ChangeNotifierProvider.value(value: guide),
    ],
    child: const KidsTvApp(),
  ));
}

class KidsTvApp extends StatefulWidget {
  const KidsTvApp({super.key});

  @override
  State<KidsTvApp> createState() => _KidsTvAppState();
}

class _KidsTvAppState extends State<KidsTvApp> with WidgetsBindingObserver {
  bool _started = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  /// Onboarding tugagach (yoki allaqachon tugagan bo'lsa) — efir ma'lumotlarini yuklaymiz
  void _startIfNeeded() {
    if (_started) return;
    _started = true;
    context.read<EventsService>().start();
    context.read<GuideStore>().refresh();
  }

  /// Fonda — SSE va taymerlarni to'xtatamiz (batareya/trafik); qaytganda — qayta ulanamiz
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_started) return;
    final events = context.read<EventsService>();
    final guide = context.read<GuideStore>();
    if (state == AppLifecycleState.paused) {
      events.stop();
      guide.pause();
    } else if (state == AppLifecycleState.resumed) {
      events.start();
      guide.refresh();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsStore>();
    if (settings.onboarded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _startIfNeeded());
    }

    return MaterialApp(
      title: settings.s.t('appName'),
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      // TV'ga kirishdan oldin: onboarding -> bolajon ismi/yoshi -> efir
      home: !settings.onboarded
          ? const OnboardingScreen()
          : !settings.hasChild
              ? const ChildSetupScreen()
              // 21:00 — 07:00: TV yopiq, okean va baliqlar
              : const NightGate(child: HomeShell()),
    );
  }
}
