import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/guide_store.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/live_player.dart';

/// Live TV Player — asosiy ekran.
/// Portret: tepada pleer, pastda kanallar ro'yxati (hozir/keyingi).
/// To'liq ekran (landshaft): faqat pleer; kanal almashtirish — svayp.
class LiveScreen extends StatefulWidget {
  const LiveScreen({super.key, required this.onFullscreenChanged, required this.onOpenSchedule});

  final ValueChanged<bool> onFullscreenChanged;
  final VoidCallback onOpenSchedule;

  @override
  State<LiveScreen> createState() => _LiveScreenState();
}

class _LiveScreenState extends State<LiveScreen> {
  bool _fullscreen = false;

  Future<void> _setFullscreen(bool v) async {
    setState(() => _fullscreen = v);
    widget.onFullscreenChanged(v);
    if (v) {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      await SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    } else {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    }
  }

  @override
  void dispose() {
    // Boshqa tabga o'tilsa — tizim panellari va orientatsiyani tiklaymiz
    if (_fullscreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final guide = context.watch<GuideStore>();
    final s = context.watch<SettingsStore>().s;
    final channel = guide.selected;

    if (channel == null) {
      if (!guide.ready && guide.error == null) {
        return const Center(child: CircularProgressIndicator());
      }
      if (!guide.ready && guide.error != null) {
        return ErrorView(message: s.t('error'), retryLabel: s.t('retry'), onRetry: guide.refresh);
      }
      return Center(child: Text(s.t('offAir'), style: const TextStyle(color: AppTheme.textDim)));
    }

    final player = LivePlayer(
      channel: channel,
      fullscreen: _fullscreen,
      onToggleFullscreen: () => _setFullscreen(!_fullscreen),
      onNextChannel: () => guide.step(1),
      onPrevChannel: () => guide.step(-1),
    );

    if (_fullscreen) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _setFullscreen(false);
        },
        child: player,
      );
    }

    return SafeArea(
      bottom: false,
      child: Column(children: [
        AspectRatio(aspectRatio: 16 / 9, child: player),
        Expanded(
          child: RefreshIndicator(
            onRefresh: guide.refresh,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              itemCount: guide.items.length + 1,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                if (i == 0) return _header(s.t('channels'), guide.utcOffset, s.f('serverTime', {'offset': 'UTC${guide.utcOffset}'}));
                final item = guide.items[i - 1];
                return _ChannelRow(
                  state: item,
                  selected: item.channel.id == channel.id,
                  onTap: () => guide.select(item.channel.id),
                  onSchedule: () {
                    guide.select(item.channel.id);
                    widget.onOpenSchedule();
                  },
                );
              },
            ),
          ),
        ),
      ]),
    );
  }

  Widget _header(String title, String offset, String hint) => Padding(
        padding: const EdgeInsets.only(bottom: 4, left: 4),
        child: Row(children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const Spacer(),
          if (offset.isNotEmpty) Text(hint, style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
        ]),
      );
}

/// Kanallar ro'yxatidagi qator: logo, nom, hozirgi dastur + progress, keyingisi
class _ChannelRow extends StatelessWidget {
  const _ChannelRow({required this.state, required this.selected, required this.onTap, required this.onSchedule});

  final NowState state;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>().s;
    final fav = context.select<SettingsStore, bool>((st) => st.isFavorite(state.channel.id));
    final cur = state.current;

    return Material(
      color: selected ? AppTheme.primary.withValues(alpha: 0.28) : AppTheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: selected ? AppTheme.primary : Colors.transparent, width: 2),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(children: [
            ChannelLogo(state.channel, size: 54),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(
                    child: Text('${state.channel.number}. ${state.channel.title}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  if (fav) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.star_rounded, size: 16, color: AppTheme.accent)),
                  const SizedBox(width: 6),
                  AgeBadge.group(state.channel.ageGroup),
                ]),
                const SizedBox(height: 4),
                Text(
                  cur?.program.title ?? s.t('offAir'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppTheme.textDim),
                ),
                if (cur != null) ...[
                  const SizedBox(height: 6),
                  ThinProgress(cur.progress ?? 0, height: 3),
                ],
                if (state.next != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${s.t('next')}: ${state.next!.startClock} ${state.next!.program.title}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textDim),
                  ),
                ],
              ]),
            ),
            IconButton(onPressed: onSchedule, icon: const Icon(Icons.event_note_rounded, color: AppTheme.textDim)),
          ]),
        ),
      ),
    );
  }
}
