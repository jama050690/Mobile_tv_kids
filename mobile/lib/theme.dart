import 'package:flutter/material.dart';

/// Bolalarga mos yorqin, lekin ko'zni charchatmaydigan qorong'i mavzu (TV uslubi)
class AppTheme {
  static const primary = Color(0xFF6C4CF5);
  static const accent = Color(0xFFFFB020);
  static const live = Color(0xFFFF4D6D);
  static const bg = Color(0xFF14112B);
  static const surface = Color(0xFF1F1A40);
  static const surfaceHi = Color(0xFF2A2456);
  static const textDim = Color(0xFFB7B2D9);

  /// Yosh toifalari ranglari
  static const ageColors = {
    '0-3': Color(0xFF3DD68C),
    '4-7': Color(0xFF4CB6FF),
    '8-12': Color(0xFFFF8A3D),
    '0+': Color(0xFF9C8CFF),
  };

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
      primary: primary,
      secondary: accent,
      surface: surface,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      appBarTheme: const AppBarTheme(backgroundColor: bg, elevation: 0, centerTitle: false),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: primary.withValues(alpha: 0.35),
        labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        margin: EdgeInsets.zero,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surface,
        selectedColor: primary,
        side: BorderSide.none,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(56, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
