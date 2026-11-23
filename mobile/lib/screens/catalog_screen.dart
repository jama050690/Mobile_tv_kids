import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/guide_store.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Kanallar katalogi: barcha kanallar kartochkalari, yosh bo'yicha filtr, sevimlilar
class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key, required this.onWatch});
  final VoidCallback onWatch;

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  /// null — hammasi; 'fav' — sevimlilar; aks holda AgeGroup
  Object? _filter;

  @override
  Widget build(BuildContext context) {
    final guide = context.watch<GuideStore>();
    final settings = context.watch<SettingsStore>();
    final s = settings.s;

    final items = guide.items.where((e) {
      final f = _filter;
      if (f == null) return true;
      if (f == 'fav') return settings.isFavorite(e.channel.id);
      // Yosh filtri: "Hamma uchun" kanallar ham ko'rinadi (backend bilan bir xil mantiq)
      return e.channel.ageGroup == f || e.channel.ageGroup == AgeGroup.all;
    }).toList();

    return SafeArea(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(s.t('channels'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              _chip(s.t('all'), null),
              _chip('★ ${s.t('favorites')}', 'fav'),
              for (final g in [AgeGroup.age0to3, AgeGroup.age4to7, AgeGroup.age8to12]) _chip('${g.label} ${s.t('ageFilter').toLowerCase()}', g),
            ],
          ),
        ),
        Expanded(
          child: !guide.ready
              ? (guide.error != null
                  ? ErrorView(message: s.t('error'), retryLabel: s.t('retry'), onRetry: guide.refresh)
                  : const Center(child: CircularProgressIndicator()))
              : RefreshIndicator(
                  onRefresh: guide.refresh,
                  child: items.isEmpty
                      ? ListView(children: [
                          const SizedBox(height: 120),
                          Center(child: Text(s.t('empty'), style: const TextStyle(color: AppTheme.textDim))),
                        ])
                      : GridView.builder(
                          padding: const EdgeInsets.all(12),
                          // Telefon: 2 ustun, planshet/TV: ko'proq
                          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 240,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            childAspectRatio: 0.78,
                          ),
                          itemCount: items.length,
                          itemBuilder: (_, i) => _ChannelCard(
                            state: items[i],
                            onTap: () {
                              guide.select(items[i].channel.id);
                              widget.onWatch();
                            },
                          ),
                        ),
                ),
        ),
      ]),
    );
  }

  Widget _chip(String label, Object? value) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: ChoiceChip(
          label: Text(label),
          selected: _filter == value,
          onSelected: (_) => setState(() => _filter = value),
        ),
      );
}

class _ChannelCard extends StatelessWidget {
  const _ChannelCard({required this.state, required this.onTap});
  final NowState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsStore>();
    final s = settings.s;
    final ch = state.channel;
    final cur = state.current;
    final fav = settings.isFavorite(ch.id);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Hozirgi dastur posteri + kanal logosi
          Expanded(
            child: Stack(fit: StackFit.expand, children: [
              NetImage(cur?.program.thumbnailUrl ?? ch.logoUrl, fallbackText: '${ch.number}'),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x00000000), Color(0xAA000000)]),
                ),
              ),
              Positioned(left: 8, top: 8, child: ChannelLogo(ch, size: 34)),
              Positioned(
                right: 0,
                top: 0,
                child: IconButton(
                  onPressed: () => settings.toggleFavorite(ch.id),
                  icon: Icon(fav ? Icons.star_rounded : Icons.star_outline_rounded, color: fav ? AppTheme.accent : Colors.white),
                ),
              ),
              if (state.status == OnAirStatus.playing) const Positioned(left: 8, bottom: 8, child: LiveDot()),
              Positioned(right: 8, bottom: 8, child: AgeBadge.group(ch.ageGroup)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${ch.number}. ${ch.title}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(
                cur?.program.title ?? s.t('offAir'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: AppTheme.textDim),
              ),
              if (cur != null) ...[
                const SizedBox(height: 6),
                ThinProgress(cur.progress ?? 0, height: 3),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}
