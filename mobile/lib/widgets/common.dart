import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme.dart';

/// Yosh belgisi: "4-7", "0+" ...
class AgeBadge extends StatelessWidget {
  const AgeBadge._(this.label, this.colorKey, {super.key});

  /// Kanal yosh toifasi
  factory AgeBadge.group(AgeGroup g, {Key? key}) => AgeBadge._(g.label, g.label, key: key);

  /// Dastur yosh chegarasi (ageRating: 0, 3, 6 ...) — "6+"
  factory AgeBadge.rating(int rating, {Key? key}) =>
      AgeBadge._('$rating+', rating <= 3 ? '0-3' : (rating <= 7 ? '4-7' : '8-12'), key: key);

  final String label;
  final String colorKey;

  @override
  Widget build(BuildContext context) {
    final c = AppTheme.ageColors[colorKey] ?? AppTheme.ageColors['0+']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(8), border: Border.all(color: c)),
      child: Text(label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w800)),
    );
  }
}

/// Tarmoqdagi rasm: yuklanmasa yoki URL yo'q bo'lsa — chiroyli zaxira ko'rinish
class NetImage extends StatelessWidget {
  const NetImage(this.url, {super.key, this.fit = BoxFit.cover, this.fallbackIcon = Icons.tv_rounded, this.fallbackText});

  final String? url;
  final BoxFit fit;
  final IconData fallbackIcon;
  final String? fallbackText;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: AppTheme.surfaceHi,
      alignment: Alignment.center,
      child: fallbackText != null
          ? Text(fallbackText!, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppTheme.textDim))
          : Icon(fallbackIcon, color: AppTheme.textDim),
    );
    // Faqat https rasmlar (bolalar ilovasida aralash kontent bo'lmasin)
    if (url == null || !url!.startsWith('https://')) return fallback;
    return Image.network(
      url!,
      fit: fit,
      errorBuilder: (_, _, _) => fallback,
      loadingBuilder: (_, child, p) => p == null ? child : fallback,
    );
  }
}

/// Kanal logotipi (yumaloq burchakli kvadrat), logo bo'lmasa — kanal raqami
class ChannelLogo extends StatelessWidget {
  const ChannelLogo(this.channel, {super.key, this.size = 48});
  final Channel channel;
  final double size;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.28),
        child: SizedBox.square(
          dimension: size,
          child: NetImage(channel.logoUrl, fit: BoxFit.cover, fallbackText: '${channel.number}'),
        ),
      );
}

/// Yupqa progress chizig'i
class ThinProgress extends StatelessWidget {
  const ThinProgress(this.value, {super.key, this.height = 4, this.color = AppTheme.accent});
  final double value;
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: LinearProgressIndicator(
          value: value.clamp(0, 1),
          minHeight: height,
          color: color,
          backgroundColor: Colors.white.withValues(alpha: 0.15),
        ),
      );
}

/// "EFIR" qizil belgisi
class LiveDot extends StatelessWidget {
  const LiveDot({super.key, this.label = 'LIVE'});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: AppTheme.live, borderRadius: BorderRadius.circular(6)),
        child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.white)),
      );
}

/// Xato holati + qayta urinish
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.retryLabel, required this.onRetry});
  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.wifi_off_rounded, size: 56, color: AppTheme.textDim),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textDim, fontSize: 16)),
            const SizedBox(height: 16),
            FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: Text(retryLabel)),
          ]),
        ),
      );
}

/// Sekund -> "12" daqiqa (yuqoriga yaxlitlash)
int minutesCeil(int sec) => (sec / 60).ceil();
