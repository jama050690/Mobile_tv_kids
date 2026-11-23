import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../config.dart';
import '../models/models.dart';
import '../services/api_client.dart';
import '../services/server_clock.dart';
import '../state/guide_store.dart';
import '../state/settings_store.dart';
import '../theme.dart';
import 'common.dart';
import 'pin_dialog.dart';

/// Jonli efir pleeri ("virtual linear TV").
///
/// Ishlash tartibi:
///  1. GET /channels/:id/now — hozirgi dastur, URL va seekOffsetSec
///  2. Video ochiladi va (seekOffset + tarmoq kechikishi) sekundga o'tkaziladi —
///     barcha tomoshabinlar bir xil joyni ko'radi
///  3. refreshInSec o'tgach (dastur almashganda) qayta so'raladi
///  4. Asosiy URL ochilmasa -> zaxira URL -> serverga xabar + "vaqtincha ochilmayapti"
///  5. Har 20s pozitsiya tekshiriladi: bufer tufayli efirdan 4s+ orqada qolsa — sakraydi
class LivePlayer extends StatefulWidget {
  const LivePlayer({
    super.key,
    required this.channel,
    required this.fullscreen,
    required this.onToggleFullscreen,
    required this.onNextChannel,
    required this.onPrevChannel,
  });

  final Channel channel;
  final bool fullscreen;
  final VoidCallback onToggleFullscreen;
  final VoidCallback onNextChannel;
  final VoidCallback onPrevChannel;

  @override
  State<LivePlayer> createState() => _LivePlayerState();
}

class _LivePlayerState extends State<LivePlayer> with WidgetsBindingObserver {
  late final ApiClient _api = context.read<ApiClient>();
  late final ServerClock _clock = context.read<ServerClock>();
  late final SettingsStore _settings = context.read<SettingsStore>();

  NowState? _now;
  VideoPlayerController? _vc;
  bool _loading = true;
  bool _netError = false;
  bool _videoFailed = false;
  bool _usingFallback = false;
  bool _overlay = true;
  int _token = 0; // har yangi yuklashda oshadi — eski javoblar e'tiborsiz qoldiriladi
  int _seenRevision = 0;

  Timer? _refreshTimer, _retryTimer, _driftTimer, _watchTimer, _tickTimer, _overlayTimer, _debounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _seenRevision = context.read<GuideStore>().revision;
    _load();
    _driftTimer = Timer.periodic(const Duration(seconds: 20), (_) => _correctDrift());
    _watchTimer = Timer.periodic(const Duration(seconds: 15), (_) => _countWatchTime());
    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _overlay) setState(() {}); // progress/qolgan vaqt jonli yangilansin
    });
    _hideOverlayLater();
  }

  @override
  void didUpdateWidget(LivePlayer old) {
    super.didUpdateWidget(old);
    if (old.channel.id != widget.channel.id) {
      // Kanal almashdi: darhol ekranni tozalaymiz, yuklashni biroz kechiktiramiz (tez varaqlash)
      _token++;
      _disposeVideo();
      setState(() {
        _now = null;
        _loading = true;
        _overlay = true;
      });
      _debounce?.cancel();
      _debounce = Timer(AppConfig.channelSwitchDebounce, _load);
      _hideOverlayLater();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _vc?.pause();
    } else if (state == AppLifecycleState.resumed) {
      _load(); // fonda vaqt o'tdi — efirga qayta ulanamiz
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final t in [_refreshTimer, _retryTimer, _driftTimer, _watchTimer, _tickTimer, _overlayTimer, _debounce]) {
      t?.cancel();
    }
    _disposeVideo();
    WakelockPlus.disable();
    super.dispose();
  }

  // =====================================================================
  //  Efir holatini olish
  // =====================================================================

  Future<void> _load() async {
    final token = ++_token;
    _refreshTimer?.cancel();
    _retryTimer?.cancel();
    if (_now == null) setState(() => _loading = true);

    try {
      final now = await _api.channelNow(widget.channel.id, tz: _settings.timezone);
      if (!mounted || token != _token) return;

      final prev = _now;
      _now = now;
      _netError = false;
      _loading = false;

      final pb = now.playback;
      if (now.status == OnAirStatus.playing && pb != null) {
        final sameVideo = _vc != null &&
            prev?.playback?.programId == pb.programId &&
            prev?.current?.slotId == now.current?.slotId &&
            !_videoFailed;
        if (sameVideo) {
          _correctDrift(); // o'sha video — faqat pozitsiyani tekshiramiz
        } else {
          _usingFallback = false;
          await _startVideo(pb.url, token);
        }
      } else {
        _disposeVideo(); // FILLER / UNAVAILABLE / OFF_AIR
      }

      // Keyingi holat o'zgarishida (dastur tugashi/boshlanishi) qayta so'raymiz
      _refreshTimer = Timer(Duration(milliseconds: now.refreshInSec * 1000 + 500), _load);
      if (mounted) setState(() {});
    } catch (_) {
      if (!mounted || token != _token) return;
      setState(() {
        _loading = false;
        _netError = true;
      });
      _retryTimer = Timer(const Duration(seconds: 8), _load);
    }
  }

  // =====================================================================
  //  Video
  // =====================================================================

  /// Efirda hozir videoning qaysi sekundi bo'lishi kerak
  double _expectedPositionSec() {
    final now = _now!;
    final pb = now.playback!;
    final latency = (_clock.nowMs() - now.serverEpochMs) / 1000;
    return pb.seekOffsetSec + (latency > 0 ? latency : 0);
  }

  Future<void> _startVideo(String url, int token) async {
    _disposeVideo();
    _videoFailed = false;
    final pb = _now!.playback!;

    final vc = VideoPlayerController.networkUrl(
      Uri.parse(url),
      formatHint: pb.isHls ? VideoFormat.hls : null,
    );
    _vc = vc;
    if (mounted) setState(() {});

    try {
      await vc.initialize().timeout(const Duration(seconds: 20));
      if (!mounted || token != _token || _vc != vc) {
        vc.dispose();
        return;
      }
      vc.addListener(_onVideoValue);
      if (!pb.isLive) {
        await vc.seekTo(Duration(milliseconds: (_expectedPositionSec() * 1000).round()));
      }
      await vc.setVolume(_settings.muted ? 0 : 1);
      if (_settings.timeIsUp) return; // limit tugagan — o'ynatmaymiz
      await vc.play();
      WakelockPlus.enable();
      if (mounted) setState(() {});
    } catch (e) {
      if (token == _token) _onVideoError('init:${e.runtimeType}');
    }
  }

  void _onVideoValue() {
    final v = _vc?.value;
    if (v != null && v.hasError) _onVideoError(v.errorDescription ?? 'playback');
  }

  /// URL ochilmadi: zaxira URL -> server xabardor qilinadi -> 30s dan keyin qayta urinish
  void _onVideoError(String code) {
    if (_videoFailed) return;
    final pb = _now?.playback;
    if (pb == null) return;
    _vc?.removeListener(_onVideoValue);

    if (!_usingFallback && pb.fallbackUrl != null) {
      _usingFallback = true;
      _startVideo(pb.fallbackUrl!, _token);
      return;
    }
    _videoFailed = true;
    _api.reportPlaybackError(pb.programId, code);
    _disposeVideo();
    if (mounted) setState(() {});
    _retryTimer?.cancel();
    _retryTimer = Timer(const Duration(seconds: 30), _load);
  }

  /// Bufer/sekin internet tufayli efirdan orqada qolsa — "jonli" nuqtaga qaytamiz
  void _correctDrift() {
    final vc = _vc;
    final pb = _now?.playback;
    if (vc == null || pb == null || pb.isLive || !vc.value.isInitialized || !vc.value.isPlaying) return;
    final expected = _expectedPositionSec();
    final actual = vc.value.position.inMilliseconds / 1000;
    if ((expected - actual).abs() > 4) {
      vc.seekTo(Duration(milliseconds: (expected * 1000).round()));
    }
  }

  void _disposeVideo() {
    final vc = _vc;
    _vc = null;
    if (vc != null) {
      vc.removeListener(_onVideoValue);
      vc.dispose();
    }
    WakelockPlus.disable();
  }

  // =====================================================================
  //  Ota-ona nazorati: kunlik limit
  // =====================================================================

  void _countWatchTime() {
    if (_vc?.value.isPlaying ?? false) {
      _settings.addWatched(15);
      if (_settings.timeIsUp) {
        _vc?.pause();
        WakelockPlus.disable();
      }
    }
  }

  Future<void> _unlockTime() async {
    if (!await verifyParent(context)) return;
    await _settings.resetWatchedToday();
    _load();
  }

  // =====================================================================
  //  Boshqaruv
  // =====================================================================

  void _toggleOverlay() {
    setState(() => _overlay = !_overlay);
    _hideOverlayLater();
  }

  void _hideOverlayLater() {
    _overlayTimer?.cancel();
    _overlayTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && (_vc?.value.isPlaying ?? false)) setState(() => _overlay = false);
    });
  }

  Future<void> _toggleMute() async {
    await _settings.setMuted(!_settings.muted);
    await _vc?.setVolume(_settings.muted ? 0 : 1);
    _hideOverlayLater();
  }

  // =====================================================================
  //  UI
  // =====================================================================

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>().s;
    final timeUp = context.select<SettingsStore, bool>((st) => st.timeIsUp);

    // SSE: admin shu kanal (yoki hamma kanallar) jadvalini o'zgartirdi -> qayta so'raymiz
    final guide = context.watch<GuideStore>();
    if (guide.revision != _seenRevision) {
      _seenRevision = guide.revision;
      final ch = guide.lastEventChannelId;
      if (ch == null || ch == widget.channel.id) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _load();
        });
      }
    }

    final vc = _vc;
    final ready = vc != null && vc.value.isInitialized;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _toggleOverlay,
      onDoubleTap: widget.onToggleFullscreen,
      // Yuqoriga/pastga surish — kanal almashtirish (TV pulti kabi)
      onVerticalDragEnd: (d) {
        final v = d.primaryVelocity ?? 0;
        if (v < -300) widget.onNextChannel();
        if (v > 300) widget.onPrevChannel();
      },
      child: Container(
        color: Colors.black,
        child: Stack(fit: StackFit.expand, children: [
          if (ready)
            Center(child: AspectRatio(aspectRatio: vc.value.aspectRatio, child: VideoPlayer(vc)))
          else
            _poster(),
          if (timeUp)
            _timeUpView(s)
          else if (!ready || _now?.status != OnAirStatus.playing)
            _statusView(s, vc),
          if (ready && vc.value.isBuffering && !timeUp) const Center(child: CircularProgressIndicator()),
          AnimatedOpacity(
            opacity: _overlay || !ready ? 1 : 0,
            duration: const Duration(milliseconds: 250),
            child: IgnorePointer(ignoring: !(_overlay || !ready), child: _overlayView(s)),
          ),
        ]),
      ),
    );
  }

  /// Video yuklanguncha — dastur posteri xira fon sifatida
  Widget _poster() {
    final thumb = _now?.current?.program.thumbnailUrl;
    if (thumb == null) return const SizedBox.shrink();
    return Opacity(opacity: 0.35, child: NetImage(thumb));
  }

  Widget _statusView(dynamic s, VideoPlayerController? vc) {
    String? text;
    IconData icon = Icons.tv_rounded;
    if (_netError) {
      text = s.t('error');
      icon = Icons.wifi_off_rounded;
    } else if (_loading || (vc != null && !vc.value.isInitialized)) {
      return const Center(child: CircularProgressIndicator());
    } else if (_videoFailed || _now?.status == OnAirStatus.unavailable) {
      text = s.t('unavailable');
      icon = Icons.ondemand_video_rounded;
    } else if (_now?.status == OnAirStatus.filler) {
      text = s.t('filler');
      icon = Icons.celebration_rounded;
    } else if (_now?.status == OnAirStatus.offAir) {
      text = s.t('offAir');
      icon = Icons.nightlight_round;
    }
    if (text == null) return const SizedBox.shrink();

    final next = _now?.next;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 52, color: AppTheme.accent),
          const SizedBox(height: 10),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          if (next != null) ...[
            const SizedBox(height: 6),
            Text(
              s.f('nextAt', {'time': next.startClock, 'title': next.program.title}),
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppTheme.textDim),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _timeUpView(dynamic s) => Container(
        color: Colors.black.withValues(alpha: 0.85),
        alignment: Alignment.center,
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.bedtime_rounded, size: 56, color: AppTheme.accent),
          const SizedBox(height: 12),
          Text(s.t('timeUp'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(s.t('timeUpHint'), textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.textDim)),
          const SizedBox(height: 16),
          OutlinedButton.icon(onPressed: _unlockTime, icon: const Icon(Icons.lock_open_rounded), label: Text(s.t('unlock'))),
        ]),
      );

  Widget _overlayView(dynamic s) {
    final ch = widget.channel;
    final cur = _now?.current;
    final muted = context.select<SettingsStore, bool>((st) => st.muted);

    // Progress va qolgan vaqt — server soati bo'yicha har soniyada hisoblanadi
    double progress = 0;
    int remaining = 0;
    if (cur != null) {
      final nowMs = _clock.nowMs();
      final start = cur.startsAtUtc.millisecondsSinceEpoch;
      final end = cur.endsAtUtc.millisecondsSinceEpoch;
      progress = end > start ? (nowMs - start) / (end - start) : 0;
      remaining = ((end - nowMs) / 1000).ceil().clamp(0, 1 << 30);
    }

    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xCC000000), Color(0x00000000), Color(0x00000000), Color(0xDD000000)],
          stops: [0, 0.3, 0.55, 1],
        ),
      ),
      child: SafeArea(
        top: widget.fullscreen,
        bottom: widget.fullscreen,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            // ---- Yuqori: kanal ----
            Row(children: [
              ChannelLogo(ch, size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Text('${ch.number}. ${ch.title}',
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ),
              if (_now?.status == OnAirStatus.playing) const LiveDot(),
              IconButton(
                tooltip: s.t('mute'),
                onPressed: _toggleMute,
                icon: Icon(muted ? Icons.volume_off_rounded : Icons.volume_up_rounded),
              ),
              IconButton(
                tooltip: s.t('fullscreen'),
                onPressed: widget.onToggleFullscreen,
                icon: Icon(widget.fullscreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded),
              ),
            ]),
            const Spacer(),
            // ---- Pastki: dastur ----
            if (cur != null) ...[
              Row(children: [
                Expanded(
                  child: Text(cur.program.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 8),
                AgeBadge.rating(cur.program.ageRating),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Text(cur.startClock, style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
                const SizedBox(width: 8),
                Expanded(child: ThinProgress(progress)),
                const SizedBox(width: 8),
                Text(cur.endClock, style: const TextStyle(fontSize: 12, color: AppTheme.textDim)),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                Text(s.f('left', {'m': minutesCeil(remaining)}), style: const TextStyle(fontSize: 12, color: AppTheme.accent)),
                const Spacer(),
                if (_now?.next != null)
                  Flexible(
                    child: Text(
                      '${s.t('next')}: ${_now!.next!.startClock} ${_now!.next!.program.title}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppTheme.textDim),
                    ),
                  ),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}
