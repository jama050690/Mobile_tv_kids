import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../services/server_clock.dart';
import '../state/guide_store.dart';
import '../state/settings_store.dart';

/// TV ish vaqti nazorati: 07:00 — 21:00 (foydalanuvchi mintaqasi bo'yicha).
/// Tunda [child] (butun TV) o'rniga "Xayrli tun" ekrani — okean va baliqlar.
/// Pleer ham yopiladi (video/trafik to'xtaydi).
class NightGate extends StatefulWidget {
  const NightGate({super.key, required this.child});
  final Widget child;

  @override
  State<NightGate> createState() => _NightGateState();
}

class _NightGateState extends State<NightGate> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Har 20 soniyada tekshiramiz: 21:00 bo'ldimi / 07:00 bo'ldimi
    _timer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// "+05:00" / "-03:30" -> daqiqa
  static int? _offsetMinutes(String o) {
    final m = RegExp(r'^([+-])(\d{2}):?(\d{2})$').firstMatch(o.trim());
    if (m == null) return null;
    final v = int.parse(m[2]!) * 60 + int.parse(m[3]!);
    return m[1] == '-' ? -v : v;
  }

  /// Foydalanuvchi mintaqasidagi hozirgi soat.
  /// Server soati (qurilma soati noto'g'ri bo'lishi mumkin) + tanlangan timezone offseti.
  /// Server hali javob bermagan bo'lsa — qurilma vaqti.
  DateTime _localNow(ServerClock clock, String utcOffset) {
    final off = _offsetMinutes(utcOffset);
    if (off == null) return DateTime.now();
    return clock.now().add(Duration(minutes: off));
  }

  @override
  Widget build(BuildContext context) {
    if (AppConfig.ignoreTvHours) return widget.child;
    final clock = context.read<ServerClock>();
    final offset = context.select<GuideStore, String>((g) => g.utcOffset);
    final h = _localNow(clock, offset).hour;
    final night = h >= AppConfig.tvCloseHour || h < AppConfig.tvOpenHour;
    return night ? const NightView() : widget.child;
  }
}

/// "Xayrli tun, {ism}! Shirin tushlar ko'r" — tungi okean animatsiyasi
class NightView extends StatefulWidget {
  const NightView({super.key});

  @override
  State<NightView> createState() => _NightViewState();
}

class _NightViewState extends State<NightView> with SingleTickerProviderStateMixin {
  // Bitta cheksiz "vaqt" — hamma narsa (to'lqin, baliq, pufak) shundan hisoblanadi
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 60))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final st = context.watch<SettingsStore>();
    final s = st.s;
    final open = '${AppConfig.tvOpenHour.toString().padLeft(2, '0')}:00';

    return Scaffold(
      backgroundColor: const Color(0xFF020B24),
      body: Stack(fit: StackFit.expand, children: [
        // ---- Okean animatsiyasi ----
        RepaintBoundary(
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, _) => CustomPaint(painter: _OceanPainter(_c.value * 60)),
          ),
        ),
        // ---- Matn: osmon qismida ----
        SafeArea(
          child: Align(
            alignment: const Alignment(0, -0.55),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(
                  s.f('nightTitle', {'name': st.displayName}),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white, shadows: [
                    Shadow(color: Color(0xAA000000), blurRadius: 12),
                  ]),
                ),
                const SizedBox(height: 8),
                Text(s.t('nightText'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Color(0xFFFFE9A8))),
                const SizedBox(height: 14),
                Text(s.f('nightHours', {'time': open}),
                    textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, color: Color(0xFFB8C7E8))),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Tungi okean: yulduzli osmon + oy, to'lqinlar, suzayotgan baliqlar, pufakchalar, suv o'tlari.
/// [t] — soniyalarda vaqt (0..60, aylanma). Barcha harakatlar 60s davrga mos — sakrash bo'lmaydi.
class _OceanPainter extends CustomPainter {
  _OceanPainter(this.t);
  final double t;

  static const _period = 60.0;
  static final _rnd = math.Random(7);
  // Yulduzlar va pufaklar joyi bir marta tasodifiy tanlanadi
  static final _stars = List.generate(40, (_) => Offset(_rnd.nextDouble(), _rnd.nextDouble()));
  static final _bubbles = List.generate(18, (_) => [_rnd.nextDouble(), _rnd.nextDouble(), 2 + _rnd.nextDouble() * 5]);

  // Baliqlar: [chuqurlik 0..1, tezlik (aylanish/60s), o'lcham, rang, yo'nalish]
  static const _fish = [
    [0.15, 1.0, 34.0, 0xFFFFA24C, 1.0],
    [0.35, 2.0, 24.0, 0xFF5EE6C9, -1.0],
    [0.50, 1.0, 44.0, 0xFFFF6B8B, 1.0],
    [0.65, 3.0, 20.0, 0xFFFFD84C, -1.0],
    [0.80, 2.0, 30.0, 0xFF8FA8FF, 1.0],
    [0.92, 1.0, 22.0, 0xFFC08CFF, -1.0],
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final seaTop = h * 0.42;
    final phase = t / _period * 2 * math.pi; // 0..2π

    // ---- Osmon ----
    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, seaTop + 20),
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF050B2E), Color(0xFF1B2A6B)],
        ).createShader(Rect.fromLTWH(0, 0, w, seaTop)),
    );
    // Yulduzlar (miltillaydi)
    for (var i = 0; i < _stars.length; i++) {
      final p = _stars[i];
      final a = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(phase * 4 + i));
      canvas.drawCircle(Offset(p.dx * w, p.dy * seaTop * 0.9), i % 5 == 0 ? 1.8 : 1.1,
          Paint()..color = Colors.white.withValues(alpha: a));
    }
    // Oy (yarim oy: sariq doira ustiga osmon rangidagi doira)
    final moon = Offset(w * 0.8, seaTop * 0.18 + 10);
    // Yarim oy = katta doira MINUS siljigan doira (fon rangiga bog'liq emas)
    final crescent = Path.combine(
      PathOperation.difference,
      Path()..addOval(Rect.fromCircle(center: moon, radius: 30)),
      Path()..addOval(Rect.fromCircle(center: moon + const Offset(12, -8), radius: 26)),
    );
    canvas.drawPath(crescent, Paint()
      ..color = const Color(0x55FFF3C4)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14)); // yumshoq nur
    canvas.drawPath(crescent, Paint()..color = const Color(0xFFFFF0B3));

    // ---- Dengiz ----
    final sea = Path()..moveTo(0, h);
    for (double x = 0; x <= w; x += 6) {
      sea.lineTo(x, seaTop + math.sin(x / w * 4 * math.pi + phase * 3) * 8);
    }
    sea
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(
      sea,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF1456A8), Color(0xFF082A63), Color(0xFF02102B)],
        ).createShader(Rect.fromLTWH(0, seaTop, w, h - seaTop)),
    );
    // Oy nurining suvdagi aksi
    for (var i = 0; i < 6; i++) {
      final y = seaTop + 14 + i * 12.0;
      final len = 50.0 - i * 6 + math.sin(phase * 6 + i) * 8;
      canvas.drawLine(Offset(moon.dx - len / 2, y), Offset(moon.dx + len / 2, y),
          Paint()
            ..color = const Color(0x55FFF0B3)
            ..strokeWidth = 3
            ..strokeCap = StrokeCap.round);
    }
    // Ikkinchi (oldingi) to'lqin qatlami
    final wave2 = Path()..moveTo(0, h);
    for (double x = 0; x <= w; x += 6) {
      wave2.lineTo(x, seaTop + 18 + math.sin(x / w * 6 * math.pi - phase * 4) * 6);
    }
    wave2
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(wave2, Paint()..color = const Color(0x221E6FD9));

    final deep = h - seaTop - 60; // baliqlar suzadigan balandlik

    // ---- Suv o'tlari (pastda tebranadi) ----
    final weed = Paint()
      ..color = const Color(0xFF1F7A5A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 7
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < 7; i++) {
      final bx = w * (0.06 + i * 0.15);
      final hh = 60.0 + (i % 3) * 35;
      final sway = math.sin(phase * 5 + i) * 14;
      final p = Path()
        ..moveTo(bx, h)
        ..quadraticBezierTo(bx - sway, h - hh * 0.5, bx + sway, h - hh);
      canvas.drawPath(p, weed);
    }

    // ---- Pufakchalar (yuqoriga ko'tariladi) ----
    final bubble = Paint()
      ..color = const Color(0x66BFE6FF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    for (final b in _bubbles) {
      final rise = ((b[1] + t / _period * 3) % 1.0); // 60s ichida 3 marta ko'tariladi
      final y = h - rise * (h - seaTop - 10);
      final x = b[0] * w + math.sin(phase * 8 + b[0] * 10) * 6;
      canvas.drawCircle(Offset(x, y), b[2], bubble);
    }

    // ---- Baliqlar ----
    for (final f in _fish) {
      final depth = f[0].toDouble(), speed = f[1].toDouble(), sz = f[2].toDouble(), dir = f[4].toDouble();
      final color = Color((f[3]).toInt());
      final span = w + sz * 4;
      var p = ((t / _period * speed) + depth) % 1.0; // 0..1 yo'l
      if (dir < 0) p = 1 - p;
      final x = p * span - sz * 2;
      final y = seaTop + 40 + depth * deep + math.sin(phase * 6 + depth * 9) * 10;
      _drawFish(canvas, Offset(x, y), sz, color, dir > 0, phase * 20 + depth * 5);
    }
  }

  void _drawFish(Canvas c, Offset o, double sz, Color color, bool right, double wiggle) {
    c.save();
    c.translate(o.dx, o.dy);
    if (!right) c.scale(-1, 1); // chapga suzadigan baliq — ko'zgu
    final body = Paint()..color = color;
    // Dum (tebranadi)
    final tail = math.sin(wiggle) * sz * 0.15;
    final tailPath = Path()
      ..moveTo(-sz * 0.45, 0)
      ..lineTo(-sz * 0.95, -sz * 0.38 + tail)
      ..lineTo(-sz * 0.85, tail)
      ..lineTo(-sz * 0.95, sz * 0.38 + tail)
      ..close();
    c.drawPath(tailPath, body);
    // Tana
    c.drawOval(Rect.fromCenter(center: Offset.zero, width: sz, height: sz * 0.62), body);
    // Yuqori suzgich
    c.drawPath(
      Path()
        ..moveTo(-sz * 0.15, -sz * 0.28)
        ..quadraticBezierTo(0, -sz * 0.55, sz * 0.15, -sz * 0.28)
        ..close(),
      body,
    );
    // Chiziqlar (yo'l-yo'l baliq)
    c.drawLine(Offset(-sz * 0.05, -sz * 0.26), Offset(-sz * 0.05, sz * 0.26),
        Paint()
          ..color = Colors.white.withValues(alpha: 0.35)
          ..strokeWidth = sz * 0.07);
    // Ko'z
    c.drawCircle(Offset(sz * 0.27, -sz * 0.06), sz * 0.09, Paint()..color = Colors.white);
    c.drawCircle(Offset(sz * 0.29, -sz * 0.06), sz * 0.045, Paint()..color = const Color(0xFF10163A));
    // Tabassum
    c.drawArc(Rect.fromCenter(center: Offset(sz * 0.33, sz * 0.08), width: sz * 0.14, height: sz * 0.1), 0.2, 2.2, false,
        Paint()
          ..color = const Color(0xAA10163A)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4);
    c.restore();
  }

  @override
  bool shouldRepaint(_OceanPainter old) => old.t != t;
}
