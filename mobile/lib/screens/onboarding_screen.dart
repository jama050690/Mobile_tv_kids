import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../services/region_detector.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/child_form.dart';

/// Splash & Onboarding: 1) til  2) bolajon ismi.
/// Davlat / vaqt mintaqasi so'ralmaydi — telefon signali (qurilma timezone'i) bo'yicha avto-aniqlanadi.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  int _step = 0;

  @override
  void initState() {
    super.initState();
    // Foydalanuvchi til va ismni kiritayotganda mintaqa fonda aniqlanadi
    context.read<RegionDetector>().detect();
  }

  Future<void> _finish() async {
    final settings = context.read<SettingsStore>();
    final detector = context.read<RegionDetector>();
    // Fondagi aniqlash tugashini kutamiz (allaqachon tugagan bo'lsa — darhol qaytadi)
    await detector.detect();
    await settings.completeOnboarding();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsStore>();
    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: switch (_step) {
            0 => _languageStep(settings),
            _ => _childStep(settings),
          },
        ),
      ),
    );
  }

  // ---------------- 1-qadam: til ----------------
  Widget _languageStep(SettingsStore settings) {
    final s = settings.s;
    return Padding(
      key: const ValueKey('lang'),
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Spacer(),
        // Ilova logotipi (assets/icon/app_icon.png)
        ClipRRect(
          borderRadius: BorderRadius.circular(32),
          child: Image.asset('assets/icon/app_icon.png', width: 140, height: 140),
        ),
        const SizedBox(height: 12),
        Text(s.t('appName'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900)),
        Text(s.t('welcome'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, color: AppTheme.textDim)),
        const Spacer(),
        Text(s.t('chooseLanguage'), style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        for (final e in S.languages.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _choice(
              selected: settings.lang == e.key,
              title: e.value,
              onTap: () => settings.setLang(e.key),
            ),
          ),
        const SizedBox(height: 10),
        FilledButton(onPressed: () => setState(() => _step = 1), child: Text(s.t('continue'))),
      ]),
    );
  }

  // ---------------- 2-qadam: bolajon ismi ----------------
  Widget _childStep(SettingsStore settings) {
    final s = settings.s;
    return SingleChildScrollView(
      key: const ValueKey('child'),
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          IconButton(onPressed: () => setState(() => _step = 0), icon: const Icon(Icons.arrow_back_rounded)),
          const SizedBox(width: 4),
          Expanded(child: Text(s.t('childStep'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900))),
        ]),
        const SizedBox(height: 8),
        const Text('👶🧒👧', textAlign: TextAlign.center, style: TextStyle(fontSize: 56)),
        const SizedBox(height: 16),
        ChildForm(
          s: s,
          buttonLabel: s.t('start'),
          initialName: settings.childName,
          onSubmit: (name) async {
            FocusScope.of(context).unfocus();
            await settings.setChild(name: name);
            await _finish();
          },
        ),
      ]),
    );
  }

  Widget _choice({required bool selected, required String title, String? subtitle, required VoidCallback onTap}) => Material(
        color: selected ? AppTheme.primary.withValues(alpha: 0.3) : AppTheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: selected ? AppTheme.primary : Colors.transparent, width: 2),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  if (subtitle != null) Text(subtitle, style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
                ]),
              ),
              if (selected) const Icon(Icons.check_circle_rounded, color: AppTheme.accent),
            ]),
          ),
        ),
      );
}


/// Onboarding'ni oldin tugatgan, lekin ism kiritmagan foydalanuvchi uchun:
/// TV'ga kirishdan oldin bolajon ma'lumotlarini so'raydi.
class ChildSetupScreen extends StatelessWidget {
  const ChildSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsStore>();
    final s = settings.s;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(s.t('childStep'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            const Text('👶🧒👧', textAlign: TextAlign.center, style: TextStyle(fontSize: 56)),
            const SizedBox(height: 16),
            ChildForm(
              s: s,
              buttonLabel: s.t('start'),
              onSubmit: (name) => settings.setChild(name: name),
            ),
          ]),
        ),
      ),
    );
  }
}
