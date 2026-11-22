import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Slot } from '../../api/types';
import { fmtDuration } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { fmtTime } from '../../lib/time';

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;
/** Surishda qo'shni slot chegarasiga "yopishish" masofasi */
const MAGNET_MS = 3 * MIN_MS;

interface Props {
  slots: Slot[];
  /** Kun chegaralari (UTC ms) — tanlangan timezone bo'yicha hisoblangan */
  from: number;
  to: number;
  tz: string;
  /** 1 soat necha piksel (zoom) */
  hourPx: number;
  onSlotClick(slot: Slot): void;
  /** Bo'sh joy bosilganda: shu vaqtdan yangi slot */
  onEmptyClick(atMs: number): void;
  /** Slot surildi: yangi vaqtlar (UTC ms) */
  onSlotMove(slot: Slot, startMs: number, endMs: number): void;
  highlightId?: string | null;
}

interface DragState {
  slot: Slot;
  pointerId: number;
  startY: number;
  origStart: number;
  origEnd: number;
  newStart: number;
  moved: boolean;
}

/** Dastur id'si bo'yicha barqaror rang */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function Timeline({ slots, from, to, tz, hourPx, onSlotClick, onEmptyClick, onSlotMove, highlightId }: Props) {
  const now = useNow(15_000);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const pxPerMs = hourPx / HOUR_MS;
  const totalHeight = (to - from) * pxPerMs;
  const y = (t: number) => (t - from) * pxPerMs;

  // Soat chiziqlari (DST kunida 23 yoki 25 ta bo'lishi mumkin)
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let t = from; t < to; t += HOUR_MS) out.push(t);
    return out;
  }, [from, to]);

  const sorted = useMemo(
    () => [...slots].sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc)),
    [slots],
  );

  /** Magnit: yangi boshlanish/tugash qo'shni slot chegarasiga yaqin bo'lsa — aynan unga tenglashtiriladi */
  const magnetize = (slot: Slot, start: number, dur: number): number => {
    let best = start;
    let bestDist = MAGNET_MS;
    for (const s of sorted) {
      if (s.id === slot.id) continue;
      const sStart = Date.parse(s.startsAtUtc);
      const sEnd = Date.parse(s.endsAtUtc);
      // bizning boshimiz -> uning oxiriga
      const d1 = Math.abs(start - sEnd);
      if (d1 < bestDist) {
        bestDist = d1;
        best = sEnd;
      }
      // bizning oxirimiz -> uning boshiga
      const d2 = Math.abs(start + dur - sStart);
      if (d2 < bestDist) {
        bestDist = d2;
        best = sStart - dur;
      }
    }
    return best;
  };

  const onPointerDown = (e: ReactPointerEvent, slot: Slot) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const s = Date.parse(slot.startsAtUtc);
    setDrag({
      slot,
      pointerId: e.pointerId,
      startY: e.clientY,
      origStart: s,
      origEnd: Date.parse(slot.endsAtUtc),
      newStart: s,
      moved: false,
    });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 4) return;
    const dur = drag.origEnd - drag.origStart;
    // Butun daqiqalarga surish (soniyalar saqlanadi), keyin magnit
    const deltaMs = Math.round(dy / pxPerMs / MIN_MS) * MIN_MS;
    const newStart = magnetize(drag.slot, drag.origStart + deltaMs, dur);
    setDrag({ ...drag, newStart, moved: true });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onSlotClick(d.slot);
      return;
    }
    if (d.newStart !== d.origStart) onSlotMove(d.slot, d.newStart, d.newStart + (d.origEnd - d.origStart));
  };

  /** Bo'sh joy bosilganda: bosilgan vaqt; oldingi slot oxiriga yaqin bo'lsa — o'sha oxirdan */
  const onGridClick = (e: ReactMouseEvent) => {
    if (drag) return;
    const rect = gridRef.current!.getBoundingClientRect();
    let at = from + (e.clientY - rect.top) / pxPerMs;
    at = Math.floor(at / MIN_MS) * MIN_MS;
    const prev = [...sorted].reverse().find((s) => Date.parse(s.endsAtUtc) <= at + MIN_MS);
    if (prev && at - Date.parse(prev.endsAtUtc) < 10 * MIN_MS) at = Date.parse(prev.endsAtUtc);
    onEmptyClick(Math.max(from, Math.min(at, to - MIN_MS)));
  };

  const nowInDay = now >= from && now < to;

  return (
    <div className="timeline">
      <div className="tl-hours" style={{ height: totalHeight }}>
        {hours.map((t) => (
          <div key={t} className="tl-hour-label" style={{ top: y(t) }}>
            {fmtTime(t, tz)}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="tl-grid"
        style={{ height: totalHeight }}
        onClick={onGridClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {hours.map((t) => (
          <div key={t} className="tl-hour-line" style={{ top: y(t) }} />
        ))}
        {hourPx >= 120 &&
          hours.map((t) => <div key={`h${t}`} className="tl-half-line" style={{ top: y(t + HOUR_MS / 2) }} />)}

        {nowInDay && (
          <div className="tl-now" style={{ top: y(now) }}>
            <span>{fmtTime(now, tz)}</span>
          </div>
        )}

        {sorted.map((s) => {
          const isDragging = drag?.slot.id === s.id && drag.moved;
          const start = isDragging ? drag.newStart : Date.parse(s.startsAtUtc);
          const end = isDragging ? drag.newStart + (drag.origEnd - drag.origStart) : Date.parse(s.endsAtUtc);
          // Kun chegarasidan chiqqan qismlar kesiladi
          const top = y(Math.max(start, from));
          const height = Math.max(3, y(Math.min(end, to)) - top);
          const hue = hueFor(s.programId);
          const short = height < 20;
          const mediaShorter = s.program.durationSec + 5 < s.durationSec;
          const cls = [
            'tl-slot',
            short ? 'tl-slot-short' : '',
            s.status === 'LIVE' ? 'tl-slot-live' : '',
            s.status === 'ENDED' ? 'tl-slot-ended' : '',
            s.program.urlStatus === 'BROKEN' ? 'tl-slot-broken' : '',
            !s.program.isActive ? 'tl-slot-inactive' : '',
            isDragging ? 'tl-slot-dragging' : '',
            highlightId === s.id ? 'tl-slot-highlight' : '',
          ].join(' ');

          return (
            <div
              key={s.id}
              className={cls}
              style={{ top, height, ['--hue' as string]: hue }}
              onPointerDown={(e) => onPointerDown(e, s)}
              onClick={(e) => e.stopPropagation()}
              title={`${fmtTime(start, tz, true)}–${fmtTime(end, tz, true)} · ${s.program.title} (${fmtDuration(
                s.durationSec,
              )})`}
            >
              {mediaShorter && !short && (
                <div
                  className="tl-filler"
                  style={{ top: `${(s.program.durationSec / s.durationSec) * 100}%` }}
                  title="Video tugagandan keyingi bo'sh qism (kutish ekrani)"
                />
              )}
              <span className="tl-slot-time">{fmtTime(start, tz, !short)}</span>
              <span className="tl-slot-title">{s.program.title}</span>
              {!short && <span className="tl-slot-dur">{fmtDuration(s.durationSec)}</span>}
              {s.program.urlStatus === 'BROKEN' && <span className="tl-slot-flag">⚠</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
