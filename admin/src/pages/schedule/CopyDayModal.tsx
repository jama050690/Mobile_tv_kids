import { useState, type FormEvent } from 'react';
import { errorText } from '../../api/client';
import { scheduleApi } from '../../api/endpoints';
import type { CopyDayResult } from '../../api/types';
import { Field, Modal } from '../../components/ui';
import { addDays, fmtDayTitle } from '../../lib/time';

/**
 * Kunni nusxalash: tanlangan kunning jadvali boshqa kunlarga ko'chiriladi
 * (mahalliy vaqt saqlanadi — DST bo'lgan davlatlarda ham 18:00 18:00 bo'lib qoladi).
 */
export function CopyDayModal({
  channelId,
  tz,
  sourceDate,
  onClose,
  onDone,
}: {
  channelId: string;
  tz: string;
  sourceDate: string;
  onClose(): void;
  onDone(r: CopyDayResult): void;
}) {
  const [mode, setMode] = useState<'next' | 'custom'>('next');
  const [days, setDays] = useState('7');
  const [custom, setCustom] = useState<string[]>([addDays(sourceDate, 1)]);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const n = Math.max(1, Math.min(31, Number(days) || 1));
  const targets =
    mode === 'next'
      ? Array.from({ length: n }, (_, i) => addDays(sourceDate, i + 1))
      : [...new Set(custom.filter((d) => d && d !== sourceDate))].sort();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targets.length) return setError('Kamida bitta kun tanlang');
    if (targets.length > 31) return setError('Ko‘pi bilan 31 kun');
    setBusy(true);
    setError(null);
    try {
      onDone(await scheduleApi.copyDay({ channelId, sourceDate, targetDates: targets, timezone: tz, replace }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Kunni nusxalash"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Bekor qilish
          </button>
          <button className={`btn ${replace ? 'btn-danger' : 'btn-primary'}`} form="copy-form" disabled={busy}>
            {busy ? 'Nusxalanmoqda...' : `${targets.length} kunga nusxalash`}
          </button>
        </>
      }
    >
      <form id="copy-form" className="stack" onSubmit={submit}>
        {error && <div className="alert alert-error pre">{error}</div>}
        <p>
          Manba: <b>{fmtDayTitle(sourceDate)}</b> <span className="muted">({tz})</span>
        </p>

        <div className="segmented">
          <button type="button" className={mode === 'next' ? 'active' : ''} onClick={() => setMode('next')}>
            Keyingi kunlarga
          </button>
          <button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>
            Tanlangan sanalarga
          </button>
        </div>

        {mode === 'next' ? (
          <Field label="Necha kun" hint={`${addDays(sourceDate, 1)} — ${addDays(sourceDate, n)}`}>
            <input type="number" min={1} max={31} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        ) : (
          <div className="stack-sm">
            {custom.map((d, i) => (
              <div className="row gap-sm" key={i}>
                <input
                  type="date"
                  value={d}
                  onChange={(e) => setCustom((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button type="button" className="icon-btn" onClick={() => setCustom((c) => c.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setCustom((c) => [...c, addDays(c[c.length - 1] ?? sourceDate, 1)])}
            >
              ＋ Sana qo‘shish
            </button>
          </div>
        )}

        <label className="row gap-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>
            Maqsad kunlardagi mavjud jadvalni <b>o‘chirib</b>, o‘rniga yozish
          </span>
        </label>
        {!replace && (
          <p className="small muted">
            O‘chirilmasa: maqsad kunda biror slot to‘qnashsa, butun amal bekor qilinadi (409).
          </p>
        )}
      </form>
    </Modal>
  );
}
