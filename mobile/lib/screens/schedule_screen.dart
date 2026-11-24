import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../l10n/strings.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../state/guide_store.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// TV dasturlar jadvali (EPG): tanlangan kanalning kunlik ko'rsatuvlari — foydalanuvchi vaqtida.
/// Kun backend tomonidan foydalanuvchi timezone'ida hisoblanadi (?date=YYYY-MM-DD&tz=...).
class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key, required this.onWatch});
  final VoidCallback onWatch;

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  ScheduleDay? _day;
  String? _today; // foydalanuvchi zonasidagi bugungi sana (birinchi javobdan)
  String? _date; // ko'rsatilayotgan sana; null — bugun
  String? _channelId;
  String? _tz;
  bool _loading = false;
  bool _error = false;
  int _seenRevision = -1;
  int _token = 0;
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final channelId = _channelId;
    if (channelId == null) return;
    final token = ++_token;
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final day = await context.read<ApiClient>().schedule(channelId, tz: _tz!, date: _date);
      if (!mounted || token != _token) return;
      setState(() {
        _day = day;
        _today ??= day.date;
        _loading = false;
      });
      _scrollToLive();
    } catch (_) {
      if (!mounted || token != _token) return;
      setState(() {
        _loading = false;
        _error = true;
      });
    }
  }

  /// Hozir efirdagi dasturga avtomatik aylantirish
  void _scrollToLive() {
    final i = _day?.items.indexWhere((e) => e.state == 'LIVE') ?? -1;
    if (i < 0) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          (i * 92.0).clamp(0, _scroll.position.maxScrollExtent),
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// "2026-11-23" + n kun (kalendar arifmetikasi, timezone'ga bog'liq emas)
  String _shift(String date, int days) {
    final d = DateTime.utc(int.parse(date.substring(0, 4)), int.parse(date.substring(5, 7)), int.parse(date.substring(8, 10)))
        .add(Duration(days: days));
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  String _dayLabel(S s, String date) {
    if (_today == null) return date;
    if (date == _today) return s.t('today');
    if (date == _shift(_today!, -1)) return s.t('yesterday');
    if (date == _shift(_today!, 1)) return s.t('tomorrow');
    return '${date.substring(8, 10)}.${date.substring(5, 7)}';
  }

  @override
  Widget build(BuildContext context) {
    final guide = context.watch<GuideStore>();
    final settings = context.watch<SettingsStore>();
    final s = settings.s;
    final channel = guide.selected;

    // Kanal yoki timezone o'zgardi / admin jadvalni yangiladi (SSE) -> qayta yuklash
    final needReload = channel != null &&
        (channel.id != _channelId || settings.timezone != _tz || guide.revision != _seenRevision);
    if (needReload) {
      final tzChanged = settings.timezone != _tz;
      _channelId = channel.id;
      _tz = settings.timezone;
      _seenRevision = guide.revision;
      if (tzChanged) {
        _today = null;
        _date = null;
      }
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }

    final current = _date ?? _today;

    return SafeArea(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: Row(children: [
            Text(s.t('schedule'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
            const Spacer(),
            if (_day != null)
              Text('${_day!.timezone.split('/').last.replaceAll('_', ' ')} · UTC${_day!.utcOffset}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
          ]),
        ),
        // ---- Kanal tanlash ----
        SizedBox(
          height: 64,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final c in guide.channels)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    avatar: ChannelLogo(c, size: 24),
                    label: Text(c.title),
                    selected: c.id == channel?.id,
                    onSelected: (_) => guide.select(c.id),
                  ),
                ),
            ],
          ),
        ),
        // ---- Kun tanlash: kecha ... +5 kun ----
        if (_today != null)
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                for (var d = -1; d <= 5; d++)
                  Builder(builder: (_) {
                    final date = _shift(_today!, d);
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text(_dayLabel(s, date)),
                        selected: date == current,
                        onSelected: (_) {
                          setState(() => _date = date);
                          _load();
                        },
                      ),
                    );
                  }),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Expanded(child: _body(s, channel)),
      ]),
    );
  }

  Widget _body(S s, Channel? channel) {
    if (channel == null || (_day == null && _loading)) return const Center(child: CircularProgressIndicator());
    if (_error && _day == null) return ErrorView(message: s.t('error'), retryLabel: s.t('retry'), onRetry: _load);
    final items = _day?.items ?? const <SlotView>[];

    return RefreshIndicator(
      onRefresh: _load,
      child: items.isEmpty
          ? ListView(children: [
              const SizedBox(height: 120),
              Center(child: Text(s.t('empty'), style: const TextStyle(color: AppTheme.textDim))),
            ])
          : ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
              itemCount: items.length,
              itemExtent: 92,
              itemBuilder: (_, i) => _SlotRow(slot: items[i], liveLabel: s.t('now'), onWatch: widget.onWatch),
            ),
    );
  }
}

class _SlotRow extends StatelessWidget {
  const _SlotRow({required this.slot, required this.liveLabel, required this.onWatch});
  final SlotView slot;
  final String liveLabel;
  final VoidCallback onWatch;

  @override
  Widget build(BuildContext context) {
    final live = slot.state == 'LIVE';
    final ended = slot.state == 'ENDED';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: ended ? 0.5 : 1,
        child: Material(
          color: live ? AppTheme.primary.withValues(alpha: 0.3) : AppTheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: live ? AppTheme.live : Colors.transparent, width: 2),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            // Faqat hozirgi dasturni "ko'rish" mumkin — bu jonli TV, VOD emas
            onTap: live ? onWatch : null,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                SizedBox(
                  width: 56,
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(slot.startClock, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                    Text(slot.endClock, style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
                  ]),
                ),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(width: 96, height: 60, child: NetImage(slot.program.thumbnailUrl, fallbackIcon: Icons.movie_rounded)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      if (live) ...[LiveDot(label: liveLabel.toUpperCase()), const SizedBox(width: 6)],
                      Expanded(
                        child: Text(slot.program.title,
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                    ]),
                    const SizedBox(height: 4),
                    Row(children: [
                      AgeBadge.group(slot.program.ageRating),
                      const SizedBox(width: 8),
                      Text('${minutesCeil(slot.durationSec)} min', style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
                    ]),
                  ]),
                ),
                if (live) const Icon(Icons.play_circle_fill_rounded, color: AppTheme.accent, size: 32),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
