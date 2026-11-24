// Backend javoblarining modellari (backend/src/playout/playout.service.ts bilan mos).

/// Yosh toifasi — backend enum AgeGroup
enum AgeGroup {
  age0to3('AGE_0_3', '0-3'),
  age4to7('AGE_4_7', '4-7'),
  age8to12('AGE_8_12', '8-12'),
  all('ALL', '0+');

  const AgeGroup(this.api, this.label);
  final String api;
  final String label;

  static AgeGroup parse(Object? v) =>
      AgeGroup.values.firstWhere((e) => e.api == v, orElse: () => AgeGroup.all);
}

/// Efir holati — backend OnAirStatus
enum OnAirStatus {
  playing, // video o'ynatiladi
  filler, // video tugadi, slot hali tugamagan — "keyingi dastur tez orada"
  unavailable, // video URL ishlamayapti
  offAir; // jadvalda hech narsa yo'q

  static OnAirStatus parse(Object? v) => switch (v) {
        'PLAYING' => OnAirStatus.playing,
        'FILLER' => OnAirStatus.filler,
        'UNAVAILABLE' => OnAirStatus.unavailable,
        _ => OnAirStatus.offAir,
      };
}

class Channel {
  Channel({
    required this.id,
    required this.title,
    required this.slug,
    required this.number,
    this.description,
    this.logoUrl,
    required this.ageGroup,
  });

  final String id;
  final String title;
  final String slug;
  final int number;
  final String? description;
  final String? logoUrl;
  final AgeGroup ageGroup;

  factory Channel.fromJson(Map<String, dynamic> j) => Channel(
        id: j['id'] as String,
        title: j['title'] as String,
        slug: j['slug'] as String,
        number: (j['number'] as num).toInt(),
        description: j['description'] as String?,
        logoUrl: j['logoUrl'] as String?,
        ageGroup: AgeGroup.parse(j['ageGroup']),
      );
}

class ProgramInfo {
  ProgramInfo({
    required this.id,
    required this.title,
    this.description,
    this.thumbnailUrl,
    required this.ageRating,
    required this.durationSec,
  });

  final String id;
  final String title;
  final String? description;
  final String? thumbnailUrl;
  /// Backend'da ham AgeGroup enum ("AGE_0_3" | "AGE_4_7" | "AGE_8_12" | "ALL")
  final AgeGroup ageRating;
  final int durationSec;

  factory ProgramInfo.fromJson(Map<String, dynamic> j) => ProgramInfo(
        id: j['id'] as String,
        title: j['title'] as String,
        description: j['description'] as String?,
        thumbnailUrl: j['thumbnailUrl'] as String?,
        ageRating: AgeGroup.parse(j['ageRating']),
        durationSec: (j['durationSec'] as num?)?.toInt() ?? 0,
      );
}

/// Jadvaldagi bitta slot. Vaqtlar ham UTC, ham foydalanuvchi mahalliy vaqtida keladi.
class SlotView {
  SlotView({
    required this.slotId,
    required this.startsAtUtc,
    required this.endsAtUtc,
    required this.startsAtLocal,
    required this.endsAtLocal,
    required this.durationSec,
    required this.program,
    this.state,
    this.elapsedSec,
    this.remainingSec,
    this.progress,
    this.startsInSec,
  });

  final String slotId;
  final DateTime startsAtUtc;
  final DateTime endsAtUtc;

  /// "2026-11-23T18:00:00+05:00" — backend foydalanuvchi timezone'ida hisoblagan
  final String startsAtLocal;
  final String endsAtLocal;
  final int durationSec;
  final ProgramInfo program;

  /// EPG: ENDED | LIVE | UPCOMING
  final String? state;
  final int? elapsedSec;
  final int? remainingSec;
  final double? progress;
  final int? startsInSec;

  /// Mahalliy "HH:mm" — qurilma timezone'idan qat'i nazar, tanlangan mintaqa vaqtida
  String get startClock => _clock(startsAtLocal);
  String get endClock => _clock(endsAtLocal);

  static String _clock(String iso) => iso.length >= 16 ? iso.substring(11, 16) : iso;

  factory SlotView.fromJson(Map<String, dynamic> j) => SlotView(
        slotId: j['slotId'] as String,
        startsAtUtc: DateTime.parse(j['startsAtUtc'] as String),
        endsAtUtc: DateTime.parse(j['endsAtUtc'] as String),
        startsAtLocal: j['startsAtLocal'] as String,
        endsAtLocal: j['endsAtLocal'] as String,
        durationSec: (j['durationSec'] as num).toInt(),
        program: ProgramInfo.fromJson(j['program'] as Map<String, dynamic>),
        state: j['state'] as String?,
        elapsedSec: (j['elapsedSec'] as num?)?.toInt(),
        remainingSec: (j['remainingSec'] as num?)?.toInt(),
        progress: (j['progress'] as num?)?.toDouble(),
        startsInSec: (j['startsInSec'] as num?)?.toInt(),
      );
}

/// Pleer uchun ma'lumot: qaysi URL, qaysi sekunddan boshlash
class Playback {
  Playback({
    required this.programId,
    required this.url,
    this.fallbackUrl,
    required this.isHls,
    required this.isLive,
    required this.seekOffsetSec,
    required this.playUntilSec,
    required this.playUntilUtc,
  });

  final String programId;
  final String url;
  final String? fallbackUrl;
  final bool isHls;
  final bool isLive;
  final double seekOffsetSec;
  final double playUntilSec;
  final DateTime playUntilUtc;

  factory Playback.fromJson(Map<String, dynamic> j) => Playback(
        programId: j['programId'] as String,
        url: j['url'] as String,
        fallbackUrl: j['fallbackUrl'] as String?,
        isHls: j['streamType'] == 'HLS',
        isLive: j['isLive'] == true,
        seekOffsetSec: (j['seekOffsetSec'] as num).toDouble(),
        playUntilSec: (j['playUntilSec'] as num).toDouble(),
        playUntilUtc: DateTime.parse(j['playUntilUtc'] as String),
      );
}

/// GET /channels/:ref/now va /guide/now dagi har bir kanal
class NowState {
  NowState({
    required this.channel,
    required this.status,
    this.current,
    this.playback,
    this.next,
    required this.refreshInSec,
    required this.serverEpochMs,
  });

  final Channel channel;
  final OnAirStatus status;
  final SlotView? current;
  final Playback? playback;
  final SlotView? next;
  final int refreshInSec;

  /// Javob hisoblangan server vaqti — seek offset'ni tarmoq kechikishiga to'g'rilash uchun
  final int serverEpochMs;

  factory NowState.fromJson(Map<String, dynamic> j, {int? serverEpochMs}) => NowState(
        channel: Channel.fromJson(j['channel'] as Map<String, dynamic>),
        status: OnAirStatus.parse(j['status']),
        current: j['current'] == null ? null : SlotView.fromJson(j['current'] as Map<String, dynamic>),
        playback: j['playback'] == null ? null : Playback.fromJson(j['playback'] as Map<String, dynamic>),
        next: j['next'] == null ? null : SlotView.fromJson(j['next'] as Map<String, dynamic>),
        refreshInSec: (j['refreshInSec'] as num?)?.toInt() ?? 60,
        serverEpochMs: serverEpochMs ?? (j['serverEpochMs'] as num).toInt(),
      );
}

class GuideNow {
  GuideNow({required this.serverEpochMs, required this.timezone, required this.utcOffset, required this.channels});

  final int serverEpochMs;
  final String timezone;
  final String utcOffset;
  final List<NowState> channels;

  factory GuideNow.fromJson(Map<String, dynamic> j) {
    final epoch = (j['serverEpochMs'] as num).toInt();
    return GuideNow(
      serverEpochMs: epoch,
      timezone: j['timezone'] as String,
      utcOffset: j['utcOffset'] as String? ?? '',
      channels: (j['channels'] as List)
          .map((e) => NowState.fromJson(e as Map<String, dynamic>, serverEpochMs: epoch))
          .toList(),
    );
  }
}

class ScheduleDay {
  ScheduleDay({required this.date, required this.timezone, required this.utcOffset, required this.channel, required this.items});

  final String date; // YYYY-MM-DD (foydalanuvchi kuni)
  final String timezone;
  final String utcOffset;
  final Channel channel;
  final List<SlotView> items;

  factory ScheduleDay.fromJson(Map<String, dynamic> j) => ScheduleDay(
        date: j['date'] as String,
        timezone: j['timezone'] as String,
        utcOffset: j['utcOffset'] as String? ?? '',
        channel: Channel.fromJson(j['channel'] as Map<String, dynamic>),
        items: (j['items'] as List).map((e) => SlotView.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class RegionTz {
  RegionTz(this.tz, this.utcOffset);
  final String tz;
  final String utcOffset;
}

class Region {
  Region({required this.code, required this.name, required this.defaultTimezone, required this.utcOffset, required this.timezones});

  final String code;
  final String name;
  final String defaultTimezone;
  final String utcOffset;
  final List<RegionTz> timezones;

  factory Region.fromJson(Map<String, dynamic> j) => Region(
        code: j['code'] as String,
        name: j['name'] as String,
        defaultTimezone: j['defaultTimezone'] as String,
        utcOffset: j['utcOffset'] as String? ?? '',
        timezones: ((j['timezones'] as List?) ?? const [])
            .map((e) => RegionTz((e as Map)['tz'] as String, e['utcOffset'] as String? ?? ''))
            .toList(),
      );
}

/// GET /regions/resolve?tz=
class ResolvedRegion {
  ResolvedRegion({required this.timezone, required this.utcOffset, this.regionCode, this.regionName});
  final String timezone;
  final String utcOffset;
  final String? regionCode;
  final String? regionName;

  factory ResolvedRegion.fromJson(Map<String, dynamic> j) {
    final r = j['region'] as Map<String, dynamic>?;
    return ResolvedRegion(
      timezone: j['timezone'] as String,
      utcOffset: j['utcOffset'] as String? ?? '',
      regionCode: r?['code'] as String?,
      regionName: r?['name'] as String?,
    );
  }
}
