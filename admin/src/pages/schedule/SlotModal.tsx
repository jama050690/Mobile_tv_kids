import { useState, type FormEvent } from 'react';
import { errorText } from '../../api/client';
import { scheduleApi } from '../../api/endpoints';
import type { Slot, SlotProgram, SlotWarning } from '../../api/types';
import { ProgramPicker } from '../../components/ProgramPicker';
import { useUi } from '../../components/Toast';
import { AgeBadge, Field, Modal, SlotStatusBadge, UrlBadge } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { fromLocalInput, offsetLabel, toLocalInput } from '../../lib/time';

/**
 * Slot qo'shish / tahrirlash.
 * Vaqt tanlangan timezone'da kiritiladi va backend'ga "lokal vaqt + timezone" ko'rinishida yuboriladi.
 */
export function SlotModal({
  channelId,
  tz,
  slot,
  defaultStartMs,
  onClose,
  onSaved,
}: {
  channelId: string;
  tz: string;
  slot: Slot | null;
  defaultStartMs?: number;
  onClose(): void;
  onSaved(warnings: SlotWarning[]): void;
}) {
  const ui = useUi();
  const [program, setProgram] = useState<SlotProgram | null>(slot?.program ?? null);
  const [picking, setPicking] = useState(!slot);
  const [start, setStart] = useState(
    toLocalInput(slot ? slot.startsAtUtc : (defaultStartMs ?? Date.now()), tz),
  );
  // Yangi slotda tugash vaqti avtomatik (video davomiyligi); tahrirda — mavjud qiymat
  const [customEnd, setCustomEnd] = useState(!!slot && slot.durationSec !== slot.program.durationSec);
  const [end, setEnd] = useState(slot ? toLocalInput(slot.endsAtUtc, tz) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startDate = fromLocalInput(start, tz);
  const endDate = customEnd
    ? fromLocalInput(end, tz)
    : startDate && program
      ? new Date(startDate.getTime() + program.durationSec * 1000)
      : null;
  const slotSec = startDate && endDate ? (endDate.getTime() - startDate.getTime()) / 1000 : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!program) return setError('Multfilmni tanlang');
    if (!startDate) return setError('Boshlanish vaqtini kiriting');
    if (customEnd && (!endDate || endDate <= startDate)) return setError('Tugash vaqti boshlanishdan keyin bo‘lishi kerak');

    setBusy(true);
    setError(null);
    try {
      const body = {
        programId: program.id,
        startsAt: start.length === 16 ? `${start}:00` : start,
        // Avtomatik rejimda: tahrirda ham video davomiyligiga moslash uchun endsAt yuboriladi
        endsAt: endDate ? toLocalInput(endDate, tz) : undefined,
        timezone: tz,
      };
      const res = slot ? await scheduleApi.update(slot.id, body) : await scheduleApi.create({ channelId, ...body });
      onSaved(res.warnings);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!slot) return;
    const ok = await ui.confirm({
      title: 'Slotni o‘chirish',
      text: `«${slot.program.title}» jadvaldan olib tashlanadi.`,
      confirmLabel: 'O‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      await scheduleApi.remove(slot.id);
      ui.success('Slot o‘chirildi');
      onSaved([]);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  return (
    <Modal
      size="lg"
      title={slot ? 'Slotni tahrirlash' : 'Jadvalga qo‘shish'}
      onClose={onClose}
      footer={
        <>
          {slot && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => void remove()}>
              O‘chirish
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="slot-form" disabled={busy || !program}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </>
      }
    >
      <form id="slot-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error field-wide pre">{error}</div>}

        <div className="field field-wide">
          <span className="field-label">Multfilm *</span>
          {program && !picking ? (
            <div className="selected-program">
              {program.thumbnailUrl ? <img src={program.thumbnailUrl} alt="" /> : <span className="thumb-ph">🎬</span>}
              <div className="grow">
                <b>{program.title}</b>
                <div className="row gap-sm wrap small">
                  <span className="mono">{fmtDuration(program.durationSec)}</span>
                  <span className="muted">{program.streamType}</span>
                  <AgeBadge age={program.ageRating} />
                  <UrlBadge status={program.urlStatus} />
                  {slot && <SlotStatusBadge status={slot.status} />}
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                Almashtirish
              </button>
            </div>
          ) : (
            <ProgramPicker
              selectedId={program?.id}
              onSelect={(p) => {
                setProgram(p);
                setPicking(false);
              }}
            />
          )}
        </div>

        <Field label={`Boshlanish * (${tz}, ${offsetLabel(tz)})`}>
          <input type="datetime-local" step={1} required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>

        <Field
          label="Tugash"
          hint={
            !customEnd
              ? 'Avtomatik: boshlanish + video davomiyligi'
              : slotSec && program && slotSec > program.durationSec + 5
                ? `Video ${fmtDuration(slotSec - program.durationSec)} oldin tugaydi — qolgan vaqtda kutish ekrani`
                : slotSec && program && slotSec + 5 < program.durationSec
                  ? `Video oxiri ${fmtDuration(program.durationSec - slotSec)} ga qirqiladi`
                  : undefined
          }
        >
          {customEnd ? (
            <input type="datetime-local" step={1} value={end} onChange={(e) => setEnd(e.target.value)} />
          ) : (
            <input disabled value={endDate ? toLocalInput(endDate, tz).replace('T', ' ') : '—'} />
          )}
        </Field>

        <div className="field field-wide">
          <label className="row gap-sm small">
            <input
              type="checkbox"
              checked={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.checked);
                if (e.target.checked && !end && endDate) setEnd(toLocalInput(endDate, tz));
              }}
            />
            Tugash vaqtini qo‘lda belgilash
          </label>
          {slotSec !== null && slotSec > 0 && (
            <span className="field-hint">Slot davomiyligi: {fmtDuration(slotSec)}</span>
          )}
        </div>
      </form>
    </Modal>
  );
}
