import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../l10n/strings.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/child_form.dart';
import '../widgets/pin_dialog.dart';
import 'onboarding_screen.dart';

/// Sozlamalar: til, mintaqa/timezone, ota-ona nazorati (PIN + kunlik limit).
/// PIN o'rnatilgan bo'lsa — mintaqa va nazorat bo'limlari PIN bilan himoyalangan.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  static const _limits = [0, 30, 60, 90, 120, 180];

  @override
  Widget build(BuildContext context) {
    final st = context.watch<SettingsStore>();
    final s = st.s;

    return SafeArea(
      child: ListView(padding: const EdgeInsets.all(16), children: [
        Text(s.t('settings'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(height: 16),

        // ---------------- Bolajon ----------------
        _section(s.t('child')),
        Card(
          child: ListTile(
            leading: const Icon(Icons.child_care_rounded, color: AppTheme.accent),
            title: Text(st.childName.isEmpty ? '—' : st.childName),
            subtitle: st.childAge != null ? Text(s.f('ageYears', {'n': st.childAge!})) : null,
            trailing: const Icon(Icons.edit_rounded),
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (ctx) => Padding(
                // Klaviatura ochilganda forma yopilib qolmasin
                padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.of(ctx).viewInsets.bottom),
                child: ChildForm(
                  s: s,
                  buttonLabel: s.t('save'),
                  initialName: st.childName,
                  initialAge: st.childAge,
                  onSubmit: (name, age) async {
                    await st.setChild(name: name, age: age);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 20),

        // ---------------- Til ----------------
        _section(s.t('language')),
        Card(
          child: RadioGroup<String>(
            groupValue: st.lang,
            onChanged: (v) {
              if (v != null) st.setLang(v);
            },
            child: Column(children: [
              for (final e in S.languages.entries) RadioListTile<String>(value: e.key, title: Text(e.value)),
            ]),
          ),
        ),
        const SizedBox(height: 20),

        // ---------------- Mintaqa ----------------
        _section(s.t('region')),
        Card(
          child: ListTile(
            leading: const Icon(Icons.public_rounded, color: AppTheme.accent),
            title: Text(st.timezone),
            subtitle: st.country != null ? Text(st.country!) : null,
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () async {
              if (!await verifyParent(context) || !context.mounted) return;
              Navigator.push(context, MaterialPageRoute(builder: (_) => const OnboardingScreen(editMode: true)));
            },
          ),
        ),
        const SizedBox(height: 20),

        // ---------------- Ota-ona nazorati ----------------
        _section(s.t('parental')),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.lock_rounded, color: AppTheme.accent),
              title: Text(st.hasPin ? s.t('pinChange') : s.t('pinSet')),
              onTap: () async {
                if (!await verifyParent(context) || !context.mounted) return;
                if (await setupPin(context) && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${s.t('pin')} ✔')));
                }
              },
            ),
            if (st.hasPin)
              ListTile(
                leading: const Icon(Icons.lock_open_rounded, color: AppTheme.textDim),
                title: Text(s.t('pinOff')),
                onTap: () async {
                  if (await verifyParent(context)) await st.setPin(null);
                },
              ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.timer_rounded, color: AppTheme.accent),
              title: Text(s.t('limit')),
              subtitle: Text(s.f('watchedToday', {'m': st.watchedSecToday ~/ 60})),
              trailing: DropdownButton<int>(
                value: _limits.contains(st.limitMinutes) ? st.limitMinutes : 0,
                underline: const SizedBox.shrink(),
                items: [
                  for (final m in _limits)
                    DropdownMenuItem(value: m, child: Text(m == 0 ? s.t('limitOff') : s.f('minutes', {'m': m}))),
                ],
                onChanged: (v) async {
                  if (v == null || !await verifyParent(context)) return;
                  await st.setLimitMinutes(v);
                },
              ),
            ),
          ]),
        ),
        const SizedBox(height: 20),

        // ---------------- Ilova haqida ----------------
        _section(s.t('about')),
        Card(
          child: ListTile(
            leading: const Icon(Icons.info_outline_rounded, color: AppTheme.textDim),
            title: Text(s.t('appName')),
            subtitle: Text(AppConfig.apiBaseUrl.replaceFirst(RegExp(r'/api/v1$'), '')),
          ),
        ),
      ]),
    );
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(title.toUpperCase(), style: const TextStyle(fontSize: 12, letterSpacing: 1, color: AppTheme.textDim, fontWeight: FontWeight.w800)),
      );
}
