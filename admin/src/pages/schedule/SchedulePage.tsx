import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorText } from '../../api/client';
import { channelsApi, regionsApi, scheduleApi } from '../../api/endpoints';
import type { Region, Slot, SlotWarning } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { TimezoneSelect } from '../../components/TimezoneSelect';
import { useUi } from '../../components/Toast';
import { Empty, ErrorBox, PageHeader, SlotStatusBadge, Spinner, UrlBadge } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { useLoad, useServerEvents, useStoredState } from '../../lib/hooks';
import { addDays, dayRangeUtc, DEFAULT_TZ, fmtDayTitle, fmtTime, offsetLabel, todayIn } from '../../lib/time';
import { CopyDayModal } from './CopyDayModal';
import { SequenceModal } from './SequenceModal';
import { SlotModal } from './SlotModal';
import { Timeline } from './Timeline';
import { ValidationPanel } from './ValidationPanel';

const ZOOMS = [60, 120, 240, 480];
const MIN_MS = 60_000;

type ModalState =
  | { kind: 'slot'; slot: Slot | null; startMs?: number }
  | { kind: 'sequence'; startMs: number }
  | { kind: 'copy' }
  | null;

/**
 * Jadval (EPG) muharriri: kanal + kun + timezone tanlanadi,
 * slotlar timeline'da ko'rsatiladi, sudrab suriladi, bo'shliqlar/muammolar yonda chiqadi.
 */
export function SchedulePage() {
  const ui = useUi();
  const { isSuper } = useAuth();
  const [params, setParams] = useSearchParams();

  // 1) Sozlamalar: timezone / zoom / ko'rinish brauzerda saqlanadi
  const [tz, setTz] = useStoredState('kidstv.tz', DEFAULT_TZ);
  const [hourPx, setHourPx] = useStoredState('kidstv.zoom', 120);
  const [view, setView] = useStoredState<'timeline' | 'list'>('kidstv.view', 'timeline');
  const [storedChannel, setStoredChannel] = useStoredState('kidstv.channel', '');
  const [modal, setModal] = useState<ModalState>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // 2) Kanallar va (super admin uchun) davlatlar zonalari
  const channels = useLoad(() => channelsApi.list(), []);
  const regions = useLoad<Region[]>(() => (isSuper ? regionsApi.list() : Promise.resolve([])), [isSuper]);
  const regionZones = useMemo(
    () => [...new Set((regions.data ?? []).flatMap((r) => [r.defaultTimezone, ...r.timezones]))],
    [regions.data],
  );

  const wanted = params.get('channel') || storedChannel;
  const channel = channels.data?.find((c) => c.id === wanted) ?? channels.data?.[0] ?? null;
  const channelId = channel?.id ?? '';
  const date = params.get('date') || todayIn(tz);
  const { from, to } = useMemo(() => dayRangeUtc(date, tz), [date, tz]);
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );

  const selectChannel = (id: string) => {
    setStoredChannel(id);
    setParam('channel', id);
  };

  // 3) Kun slotlari va tekshiruv natijasi
  const slots = useLoad<Slot[]>(
    () => (channelId ? scheduleApi.list(channelId, from.toISOString(), to.toISOString(), tz) : Promise.resolve([])),
    [channelId, fromMs, toMs, tz],
  );
  const validation = useLoad(
    () =>
      channelId
        ? scheduleApi.validate(channelId, from.toISOString(), to.toISOString(), tz)
        : Promise.resolve(null),
    [channelId, fromMs, toMs, tz],
  );

  const refresh = () => {
    void slots.reload(true);
    void validation.reload(true);
  };

  // 4) Boshqa admin yoki fon jarayoni jadvalni o'zgartirsa — jonli yangilanish
  useServerEvents(['schedule.updated', 'program.updated'], refresh, channelId || undefined);

  const sorted = useMemo(
    () => [...(slots.data ?? [])].sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc)),
    [slots.data],
  );

  /** Yangi slot uchun standart boshlanish: kunning oxirgi sloti tugagan joy yoki hozir/kun boshi */
  const nextFreeStart = (): number => {
    const last = sorted[sorted.length - 1];
    if (last) return Math.min(Date.parse(last.endsAtUtc), toMs - MIN_MS);
    const now = Math.ceil(Date.now() / MIN_MS) * MIN_MS;
    return now > fromMs && now < toMs ? now : fromMs;
  };

  // 5) Timeline'ni hozirgi vaqtga (yoki birinchi slotga) aylantirish
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef('');
  useEffect(() => {
    const key = `${channelId}|${date}|${tz}|${hourPx}`;
    if (!slots.data || !scrollRef.current || scrolledFor.current === key) return;
    scrolledFor.current = key;
    const now = Date.now();
    const target = now >= fromMs && now < toMs ? now : sorted[0] ? Date.parse(sorted[0].startsAtUtc) : fromMs;
    scrollRef.current.scrollTop = Math.max(0, ((target - fromMs) / 3_600_000) * hourPx - 120);
  }, [slots.data, channelId, date, tz, hourPx, fromMs, toMs, sorted]);

  const showWarnings = (warnings: SlotWarning[]) => {
    // Bir xil ogohlantirishlar ko'p bo'lsa (ketma-ket qo'shishda) — guruhlab ko'rsatamiz
    const byCode = new Map<string, { message: string; n: number }>();
    for (const w of warnings) {
      const e = byCode.get(w.code);
      if (e) e.n++;
      else byCode.set(w.code, { message: w.message, n: 1 });
    }
    for (const { message, n } of byCode.values()) ui.toast(n > 1 ? `${message} (×${n})` : message, 'warning');
  };

  /** Sudrab surish: darhol ekranda ko'rsatiladi, xato bo'lsa qaytariladi */
  const moveSlot = async (slot: Slot, startMs: number, endMs: number) => {
    const startsAtUtc = new Date(startMs).toISOString();
    const endsAtUtc = new Date(endMs).toISOString();
    slots.setData((list) =>
      (list ?? []).map((s) => (s.id === slot.id ? { ...s, startsAtUtc, endsAtUtc } : s)),
    );
    try {
      const res = await scheduleApi.update(slot.id, { startsAt: startsAtUtc, endsAt: endsAtUtc });
      ui.success(`«${slot.program.title}» → ${fmtTime(startMs, tz, true)}`);
      showWarnings(res.warnings);
    } catch (e) {
      ui.error(errorText(e));
    } finally {
      refresh();
    }
  };

  const clearDay = async () => {
    if (!channel) return;
    const ok = await ui.confirm({
      title: 'Kunni tozalash',
      text: `«${channel.title}» kanalining ${fmtDayTitle(date)} (${tz}) kungi ${sorted.length} ta sloti o‘chiriladi.`,
      confirmLabel: 'Hammasini o‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await scheduleApi.clearRange(channelId, from.toISOString(), to.toISOString());
      ui.success(`${r.deleted} ta slot o‘chirildi`);
    } catch (e) {
      ui.error(errorText(e));
    } finally {
      refresh();
    }
  };

  const openSlotById = (id: string) => {
    const s = sorted.find((x) => x.id === id);
    setHighlightId(id);
    if (s) setModal({ kind: 'slot', slot: s });
  };

  // ---------------- Render ----------------
  if (channels.loading && !channels.data) return <Spinner />;
  if (channels.error) return <ErrorBox text={channels.error} onRetry={() => void channels.reload()} />;
  if (!channel)
    return (
      <>
        <PageHeader title="Jadval" />
        <Empty>Avval «Kanallar» bo‘limida kanal yarating.</Empty>
      </>
    );

  const totalSec = sorted.reduce((s, x) => s + x.durationSec, 0);
  const isToday = date === todayIn(tz);

  return (
    <>
      <PageHeader
        title="Jadval"
        subtitle={
          <>
            {fmtDayTitle(date)} · {tz} ({offsetLabel(tz, from)}) · {sorted.length} ta slot · {fmtDuration(totalSec)}
          </>
        }
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setModal({ kind: 'slot', slot: null, startMs: nextFreeStart() })}>
              ＋ Slot
            </button>
            <button className="btn" onClick={() => setModal({ kind: 'sequence', startMs: nextFreeStart() })}>
              ☰ Ketma-ket
            </button>
            <button className="btn" onClick={() => setModal({ kind: 'copy' })} disabled={!sorted.length}>
              ⧉ Nusxalash
            </button>
            <button className="btn btn-danger-ghost" onClick={() => void clearDay()} disabled={!sorted.length}>
              Tozalash
            </button>
          </>
        }
      />

      {/* Boshqaruv paneli */}
      <div className="filters schedule-toolbar">
        <select value={channelId} onChange={(e) => selectChannel(e.target.value)}>
          {channels.data!.map((c) => (
            <option key={c.id} value={c.id}>
              {c.number}. {c.title}
              {c.isActive ? '' : ' (o‘chiq)'}
            </option>
          ))}
        </select>

        <div className="row gap-sm">
          <button className="btn btn-sm" onClick={() => setParam('date', addDays(date, -1))} title="Oldingi kun">
            ‹
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && setParam('date', e.target.value)} />
          <button className="btn btn-sm" onClick={() => setParam('date', addDays(date, 1))} title="Keyingi kun">
            ›
          </button>
          <button className="btn btn-sm" onClick={() => setParam('date', null)} disabled={isToday}>
            Bugun
          </button>
        </div>

        <TimezoneSelect value={tz} onChange={setTz} extra={regionZones} />

        <div className="segmented">
          <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>
            Timeline
          </button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            Ro‘yxat
          </button>
        </div>

        {view === 'timeline' && (
          <div className="segmented" title="Masshtab (1 soat balandligi)">
            {ZOOMS.map((z) => (
              <button key={z} className={hourPx === z ? 'active' : ''} onClick={() => setHourPx(z)}>
                {z / 60}×
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="schedule-layout">
        <div className="card schedule-main">
          {slots.error ? (
            <ErrorBox text={slots.error} onRetry={() => void slots.reload()} />
          ) : slots.loading && !slots.data ? (
            <Spinner />
          ) : view === 'timeline' ? (
            <>
              <p className="small muted tl-help">
                Bo‘sh joyni bosing — yangi slot. Slotni sudrang — vaqtini o‘zgartirish (qo‘shni slotga yopishadi).
              </p>
              <div className="tl-scroll" ref={scrollRef}>
                <Timeline
                  slots={sorted}
                  from={fromMs}
                  to={toMs}
                  tz={tz}
                  hourPx={hourPx}
                  highlightId={highlightId}
                  onSlotClick={(s) => {
                    setHighlightId(s.id);
                    setModal({ kind: 'slot', slot: s });
                  }}
                  onEmptyClick={(at) => setModal({ kind: 'slot', slot: null, startMs: at })}
                  onSlotMove={(s, a, b) => void moveSlot(s, a, b)}
                />
              </div>
            </>
          ) : sorted.length === 0 ? (
            <Empty>Bu kunga hali hech narsa qo‘yilmagan.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vaqt</th>
                    <th>Multfilm</th>
                    <th>Davomiylik</th>
                    <th>Holat</th>
                    <th>URL</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => {
                    const prev = sorted[i - 1];
                    const gapSec = prev ? (Date.parse(s.startsAtUtc) - Date.parse(prev.endsAtUtc)) / 1000 : 0;
                    return (
                      <tr key={s.id} className={s.status === 'ENDED' ? 'row-muted' : highlightId === s.id ? 'row-highlight' : ''}>
                        <td className="mono">
                          {gapSec >= 1 && <div className="gap-note">↕ bo‘shliq {fmtDuration(gapSec)}</div>}
                          {fmtTime(s.startsAtUtc, tz, true)} – {fmtTime(s.endsAtUtc, tz, true)}
                        </td>
                        <td>
                          {s.program.title}
                          {!s.program.isActive && <span className="small muted"> (nofaol)</span>}
                        </td>
                        <td className="mono">
                          {fmtDuration(s.durationSec)}
                          {s.program.durationSec + 5 < s.durationSec && (
                            <div className="small muted">video {fmtDuration(s.program.durationSec)}</div>
                          )}
                        </td>
                        <td>
                          <SlotStatusBadge status={s.status} />
                        </td>
                        <td>
                          <UrlBadge status={s.program.urlStatus} />
                        </td>
                        <td className="actions">
                          <button className="btn btn-sm" onClick={() => setModal({ kind: 'slot', slot: s })}>
                            Tahrirlash
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card schedule-side">
          <div className="card-head">
            <h3>Tekshiruv</h3>
            <button className="btn btn-sm btn-ghost" onClick={() => void validation.reload()}>
              ⟳
            </button>
          </div>
          <ValidationPanel
            data={validation.data}
            error={validation.error}
            loading={validation.loading}
            tz={tz}
            onGapClick={(at) => setModal({ kind: 'slot', slot: null, startMs: at })}
            onIssueClick={openSlotById}
          />
        </aside>
      </div>

      {modal?.kind === 'slot' && (
        <SlotModal
          key={modal.slot?.id ?? `new-${modal.startMs}`}
          channelId={channelId}
          tz={tz}
          slot={modal.slot}
          defaultStartMs={modal.startMs}
          onClose={() => setModal(null)}
          onSaved={(w) => {
            setModal(null);
            if (modal.slot === null) ui.success('Slot qo‘shildi');
            showWarnings(w);
            refresh();
          }}
        />
      )}

      {modal?.kind === 'sequence' && (
        <SequenceModal
          channelId={channelId}
          tz={tz}
          defaultStartMs={modal.startMs}
          onClose={() => setModal(null)}
          onDone={(r) => {
            setModal(null);
            ui.success(`${r.created} ta slot qo‘shildi (${fmtTime(r.fromUtc, tz)}–${fmtTime(r.toUtc, tz)})`);
            showWarnings(r.warnings);
            refresh();
          }}
        />
      )}

      {modal?.kind === 'copy' && (
        <CopyDayModal
          channelId={channelId}
          tz={tz}
          sourceDate={date}
          onClose={() => setModal(null)}
          onDone={(r) => {
            setModal(null);
            const created = r.results.reduce((s, x) => s + x.created, 0);
            const deleted = r.results.reduce((s, x) => s + x.deleted, 0);
            ui.success(
              `${r.results.length} kunga nusxalandi: +${created} slot${deleted ? `, ${deleted} ta eski o‘chirildi` : ''}`,
            );
            refresh();
          }}
        />
      )}
    </>
  );
}
