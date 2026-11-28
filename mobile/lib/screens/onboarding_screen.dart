import 'package:flutter/material.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/child_form.dart';

/// Splash & Onboarding: 1) til  2) bolajon ismi  3) davlat / timezone (avto-aniqlash)
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, this.editMode = false});

  /// true — Sozlamalardan ochilgan (faqat mintaqa tanlash, oxirida orqaga qaytadi)
  final bool editMode;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  late int _step = widget.editMode ? 2 : 0;

  List<Region> _regions = const [];
  String? _deviceTz;
  ResolvedRegion? _detected;
  String? _tz; // tanlangan timezone
  String? _country; // tanlangan davlat kodi
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _detect();
  }

  /// Qurilma timezone'ini olib, backend orqali davlatni aniqlaymiz
  Future<void> _detect() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    final api = context.read<ApiClient>();
    final settings = context.read<SettingsStore>();
    try {
      _deviceTz ??= (await FlutterTimezone.getLocalTimezone()).identifier;
    } catch (_) {
      _deviceTz ??= 'Asia/Tashkent';
    }
    try {
      final results = await Future.wait([api.regions(), api.resolveRegion(_deviceTz!)]);
      _regions = results[0] as List<Region>;
      _detected = results[1] as ResolvedRegion;
      if (widget.editMode) {
        _tz = settings.timezone;
        _country = settings.country;
      } else {
        _tz = _detected!.timezone;
        _country = _detected!.regionCode;
      }
    } catch (_) {
      _failed = true;
      // Server javob bermasa ham qurilma timezone'i bilan davom etish mumkin
      _tz ??= _deviceTz;
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _finish() async {
    final settings = context.read<SettingsStore>();
    await settings.setRegion(timezone: _tz ?? _deviceTz ?? 'Asia/Tashkent', country: _country);
    if (widget.editMode) {
      if (mounted) Navigator.pop(context);
    } else {
      await settings.completeOnboarding();
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsStore>();
    final s = settings.s;
    return Scaffold(
      appBar: widget.editMode ? AppBar(title: Text(s.t('chooseRegion'))) : null,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: switch (_step) {
            0 => _languageStep(settings),
            1 => _childStep(settings),
            _ => _regionStep(s),
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
          buttonLabel: s.t('continue'),
          initialName: settings.childName,
          onSubmit: (name) async {
            FocusScope.of(context).unfocus();
            await settings.setChild(name: name);
            if (mounted) setState(() => _step = 2);
          },
        ),
      ]),
    );
  }

  // ---------------- 3-qadam: davlat / timezone ----------------
  Widget _regionStep(S s) {
    if (_loading) return const Center(key: ValueKey('loading'), child: CircularProgressIndicator());

    // Tanlangan davlatning qo'shimcha zonalari (masalan Rossiya — bir nechta)
    final region = _regions.where((r) => r.code == _country).firstOrNull;
    final zones = region == null ? const <RegionTz>[] : [RegionTz(region.defaultTimezone, region.utcOffset), ...region.timezones.where((z) => z.tz != region.defaultTimezone)];

    return Padding(
      key: const ValueKey('region'),
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!widget.editMode)
          Text(s.t('chooseRegion'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        const SizedBox(height: 12),
        if (_detected != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.my_location_rounded, color: AppTheme.accent),
              title: Text(_detected!.regionName ?? _detected!.timezone),
              subtitle: Text('${s.t('detected')} · ${_detected!.timezone} (UTC${_detected!.utcOffset})'),
              trailing: _tz == _detected!.timezone && _country == _detected!.regionCode
                  ? const Icon(Icons.check_circle_rounded, color: AppTheme.accent)
                  : null,
              onTap: () => setState(() {
                _tz = _detected!.timezone;
                _country = _detected!.regionCode;
              }),
            ),
          ),
        if (_failed)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              Expanded(child: Text(s.t('error'), style: const TextStyle(color: AppTheme.textDim))),
              TextButton(onPressed: _detect, child: Text(s.t('retry'))),
            ]),
          ),
        const SizedBox(height: 12),
        Expanded(
          child: ListView(children: [
            for (final r in _regions)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _choice(
                  selected: _country == r.code,
                  title: r.name,
                  subtitle: '${r.defaultTimezone} · UTC${r.utcOffset}',
                  onTap: () => setState(() {
                    _country = r.code;
                    _tz = r.defaultTimezone;
                  }),
                ),
              ),
          ]),
        ),
        if (zones.length > 1) ...[
          Text(s.t('timezone'), style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final z in zones)
              ChoiceChip(
                label: Text('${z.tz.split('/').last.replaceAll('_', ' ')} (UTC${z.utcOffset})'),
                selected: _tz == z.tz,
                onSelected: (_) => setState(() => _tz = z.tz),
              ),
          ]),
          const SizedBox(height: 12),
        ],
        FilledButton(
          onPressed: _tz == null ? null : _finish,
          child: Text(widget.editMode ? s.t('save') : s.t('start')),
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
