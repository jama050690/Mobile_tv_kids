import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/settings_store.dart';

/// 4 raqamli PIN so'rash. Bekor qilinsa null qaytaradi.
Future<String?> askPin(BuildContext context, String title) {
  final s = context.read<SettingsStore>().s;
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: ctrl,
        autofocus: true,
        obscureText: true,
        keyboardType: TextInputType.number,
        maxLength: 4,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 28, letterSpacing: 16),
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: const InputDecoration(counterText: ''),
        onSubmitted: (v) => v.length == 4 ? Navigator.pop(ctx, v) : null,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.t('cancel'))),
        FilledButton(
          onPressed: () => ctrl.text.length == 4 ? Navigator.pop(ctx, ctrl.text) : null,
          child: Text(s.t('continue')),
        ),
      ],
    ),
  );
}

/// Ota-ona tekshiruvi: PIN o'rnatilmagan bo'lsa — true; o'rnatilgan bo'lsa to'g'ri kiritilishi kerak
Future<bool> verifyParent(BuildContext context) async {
  final settings = context.read<SettingsStore>();
  if (!settings.hasPin) return true;
  final pin = await askPin(context, settings.s.t('pinEnter'));
  if (pin == null) return false;
  final ok = settings.checkPin(pin);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(settings.s.t('pinWrong'))));
  }
  return ok;
}

/// Yangi PIN o'rnatish (ikki marta kiritiladi). Muvaffaqiyatli bo'lsa true.
Future<bool> setupPin(BuildContext context) async {
  final settings = context.read<SettingsStore>();
  final s = settings.s;
  final first = await askPin(context, s.t('pinNew'));
  if (first == null || !context.mounted) return false;
  final second = await askPin(context, s.t('pinRepeat'));
  if (second == null || !context.mounted) return false;
  if (first != second) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('pinMismatch'))));
    return false;
  }
  await settings.setPin(first);
  return true;
}
