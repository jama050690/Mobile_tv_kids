import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/settings_store.dart';
import 'catalog_screen.dart';
import 'live_screen.dart';
import 'schedule_screen.dart';
import 'settings_screen.dart';

/// Asosiy qobiq: Efir | Kanallar | Dastur | Sozlamalar
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  bool _fullscreen = false;

  void _goLive() => setState(() => _tab = 0);

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>().s;

    final pages = [
      LiveScreen(onFullscreenChanged: (v) => setState(() => _fullscreen = v), onOpenSchedule: () => setState(() => _tab = 2)),
      CatalogScreen(onWatch: _goLive),
      ScheduleScreen(onWatch: _goLive),
      const SettingsScreen(),
    ];

    return PopScope(
      // Android "orqaga": avval Efir tabiga qaytaramiz
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _goLive();
      },
      child: Scaffold(
        // Efir pleeri tab almashganda ham to'xtamasligi uchun IndexedStack ishlatilmaydi:
        // boshqa tabda pleer yopiladi, qaytganda efirga qayta ulanadi (trafik tejaladi).
        body: pages[_tab],
        bottomNavigationBar: _fullscreen
            ? null
            : NavigationBar(
                selectedIndex: _tab,
                onDestinationSelected: (i) => setState(() => _tab = i),
                destinations: [
                  NavigationDestination(icon: const Icon(Icons.live_tv_rounded), label: s.t('live')),
                  NavigationDestination(icon: const Icon(Icons.grid_view_rounded), label: s.t('channels')),
                  NavigationDestination(icon: const Icon(Icons.event_note_rounded), label: s.t('schedule')),
                  NavigationDestination(icon: const Icon(Icons.settings_rounded), label: s.t('settings')),
                ],
              ),
      ),
    );
  }
}
