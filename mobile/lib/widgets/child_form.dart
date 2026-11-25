import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../theme.dart';

/// Bolajon ma'lumotlari: ism + yosh (2..12).
/// Onboarding'da ham, Sozlamalarda ham ishlatiladi.
class ChildForm extends StatefulWidget {
  const ChildForm({
    super.key,
    required this.s,
    required this.buttonLabel,
    required this.onSubmit,
    this.initialName = '',
    this.initialAge,
  });

  final S s;
  final String buttonLabel;
  final String initialName;
  final int? initialAge;
  final void Function(String name, int age) onSubmit;

  static const ages = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  @override
  State<ChildForm> createState() => _ChildFormState();
}

class _ChildFormState extends State<ChildForm> {
  late final _name = TextEditingController(text: widget.initialName);
  late int? _age = widget.initialAge;

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

  bool get _valid => _name.text.trim().isNotEmpty && _age != null;

  @override
  Widget build(BuildContext context) {
    final s = widget.s;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      // ---- Ism ----
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
      const SizedBox(height: 20),
      // ---- Yosh ----
      Text(s.t('childAge'), style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final a in ChildForm.ages)
          ChoiceChip(
            showCheckmark: false,
            label: Text(s.f('ageYears', {'n': a}), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            selected: _age == a,
            onSelected: (_) => setState(() => _age = a),
          ),
      ]),
      const SizedBox(height: 24),
      FilledButton(
        onPressed: _valid ? () => widget.onSubmit(_name.text.trim(), _age!) : null,
        child: Text(widget.buttonLabel),
      ),
    ]);
  }
}
