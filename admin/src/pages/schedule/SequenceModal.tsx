import { useState, type FormEvent } from 'react';
import { errorText } from '../../api/client';
import { scheduleApi } from '../../api/endpoints';
import type { Program, SequenceResult } from '../../api/types';
import { ProgramPicker } from '../../components/ProgramPicker';
import { Field, Modal } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/time';

/**
 * Ketma-ket qo'shish ("playlist"): tanlangan multfilmlar orqama-orqa jadvalga qo'yiladi.
 * Bitta so'rov, bitta tranzaksiya — to'qnashuv bo'lsa hech biri qo'shilmaydi.
 */
export function SequenceModal({
  channelId,
  tz,
  defaultStartMs,
  onClose,
  onDone,
}: {
  channelId: string;
  tz: string;
  defaultStartMs: number;
  onClose(): void;
  onDone(r: SequenceResult): void;
}) {
  const [list, setList] = useState<Program[]>([]);
  const [start, setStart] = useState(toLocalInput(defaultStartMs, tz));
  const [gapSec, setGapSec] = useState('0');
  const [repeat, setRepeat] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gap = Math.max(0, Math.min(3600, Number(gapSec) || 0));
  const times = Math.max(1, Math.min(50, Number(repeat) || 1));
  const ids = Array.from({ length: times }, () => list.map((p) => p.id)).flat();
  const totalSec = list.reduce((s, p) => s + p.durationSec, 0) * times + gap * Math.max(0, ids.length - 1);
  const startDate = fromLocalInput(start, tz);

  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ids.length) return setError('Kamida bitta multfilm tanlang');
    if (ids.length > 500) return setError('Bir martada ko‘pi bilan 500 ta slot');
    if (!startDate) return setError('Boshlanish vaqtini kiriting');
    setBusy(true);
    setError(null);
    try {
      const r = await scheduleApi.sequence({
        channelId,
        programIds: ids,
        startsAt: start.length === 16 ? `${start}:00` : start,
        timezone: tz,
        gapSec: gap,
      });
      onDone(r);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Ketma-ket qo‘shish"
      onClose={onClose}
      footer={
        <>
          <span className="grow small muted">
            {ids.length} ta slot · {fmtDuration(totalSec)}
            {startDate && ids.length > 0 && ` · tugashi ${fmtDateTime(startDate.getTime() + totalSec * 1000, tz)}`}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="seq-form" disabled={busy || !ids.length}>
            {busy ? 'Qo‘shilmoqda...' : 'Jadvalga qo‘shish'}
          </button>
        </>
      }
    >
      <form id="seq-form" className="seq-layout" onSubmit={submit}>
        {error && <div className="alert alert-error pre">{error}</div>}
        <div className="form-grid">
          <Field label={`Boshlanish (${tz})`}>
            <input type="datetime-local" step={1} required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Oradagi tanaffus (soniya)">
            <input type="number" min={0} max={3600} value={gapSec} onChange={(e) => setGapSec(e.target.value)} />
          </Field>
          <Field label="Necha marta takrorlash" hint="Butun ro‘yxat shuncha marta ketma-ket qo‘yiladi">
            <input type="number" min={1} max={50} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
        </div>

        <div className="seq-cols">
          <div>
            <h4>Multfilmlar (bosib qo‘shing)</h4>
            <ProgramPicker multi onSelect={(p) => setList((l) => [...l, p])} />
          </div>
          <div>
            <h4>Tartib ({list.length})</h4>
            {list.length === 0 && <p className="muted small">Chapdagi ro‘yxatdan tanlang</p>}
            <ol className="seq-list">
              {list.map((p, i) => (
                <li key={`${p.id}-${i}`}>
                  <span className="grow ellipsis">{p.title}</span>
                  <span className="mono small">{fmtDuration(p.durationSec)}</span>
                  <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </form>
    </Modal>
  );
}
