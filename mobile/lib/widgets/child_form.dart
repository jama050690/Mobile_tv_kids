import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../theme.dart';

/// Bolajon ma'lumotlari: faqat ism (yosh so'ralmaydi).
/// Onboarding'da ham, Sozlamalarda ham ishlatiladi.
class ChildForm extends StatefulWidget {
  const ChildForm({
    super.key,
    required this.s,
    required this.buttonLabel,
    required this.onSubmit,
    this.initialName = '',
  });

  final S s;
  final String buttonLabel;
  final String initialName;
  final void Function(String name) onSubmit;

  @override
  State<ChildForm> createState() => _ChildFormState();
}

class _ChildFormState extends State<ChildForm> {
  late final _name = TextEditingController(text: widget.initialName);

  @override
  void initState() {
    super.initState();
    // Ism yozilganda tugma holati yangilansin
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().isNotEmpty;

  void _submit() {
    if (_valid) widget.onSubmit(_name.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.s;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Text(s.t('childName'), style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      TextField(
        key: const ValueKey('childName'),
        controller: _name,
        maxLength: 20,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.done,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        decoration: InputDecoration(
          hintText: s.t('childNameHint'),
          prefixIcon: const Icon(Icons.child_care_rounded, color: AppTheme.accent),
          filled: true,
          fillColor: AppTheme.surface,
          counterText: '',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        ),
      ),
      const SizedBox(height: 24),
      FilledButton(
        onPressed: _valid ? _submit : null,
        child: Text(widget.buttonLabel),
      ),
    ]);
  }
}
