import { useState, type FormEvent } from 'react';
import { errorText } from '../api/client';
import { regionsApi } from '../api/endpoints';
import type { Region } from '../api/types';
import { TimezoneSelect } from '../components/TimezoneSelect';
import { useUi } from '../components/Toast';
import { ActiveBadge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../components/ui';
import { useLoad } from '../lib/hooks';
import { DEFAULT_TZ, fmtTime, offsetLabel } from '../lib/time';

/**
 * Davlatlar va ularning timezone'lari (faqat super admin).
 * Mobil ilova foydalanuvchi davlatini aniqlab, shu yerdagi standart zonani oladi.
 */
export function RegionsPage() {
  const ui = useUi();
  const regions = useLoad(() => regionsApi.list(), []);
  const [editing, setEditing] = useState<Region | 'new' | null>(null);

  const toggle = async (r: Region) => {
    try {
      await regionsApi.update(r.code, { isActive: !r.isActive });
      void regions.reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  const remove = async (r: Region) => {
    const ok = await ui.confirm({
      title: 'Davlatni o‘chirish',
      text: `${r.name} (${r.code}) o‘chiriladi. Bu davlatdagi ilovalar standart zonaga (${DEFAULT_TZ}) qaytadi.`,
      confirmLabel: 'O‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      await regionsApi.remove(r.code);
      ui.success('O‘chirildi');
      void regions.reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Davlatlar va vaqt zonalari"
        subtitle="Jadval UTC'da saqlanadi — bu yerda har davlat uchun ko‘rsatish zonasi belgilanadi"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            ＋ Davlat
          </button>
        }
      />

      {regions.loading && !regions.data ? (
        <Spinner />
      ) : regions.error ? (
        <ErrorBox text={regions.error} onRetry={() => void regions.reload()} />
      ) : !regions.data?.length ? (
        <Empty>Hali davlat qo‘shilmagan.</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Nomi</th>
                <th>Standart zona</th>
                <th>Hozirgi vaqt</th>
                <th>Qo‘shimcha zonalar</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {regions.data.map((r) => (
                <tr key={r.code} className={r.isActive ? '' : 'row-muted'}>
                  <td className="mono">
                    <b>{r.code}</b>
                  </td>
                  <td>{r.name}</td>
                  <td>
                    {r.defaultTimezone} <span className="muted small">{offsetLabel(r.defaultTimezone)}</span>
                  </td>
                  <td className="mono">{fmtTime(Date.now(), r.defaultTimezone)}</td>
                  <td className="small">
                    {r.timezones.filter((z) => z !== r.defaultTimezone).join(', ') || <span className="muted">—</span>}
                  </td>
                  <td>
                    <button className="link-btn" onClick={() => void toggle(r)} title="Yoqish / o‘chirish">
                      <ActiveBadge active={r.isActive} />
                    </button>
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(r)}>
                      Tahrirlash
                    </button>
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => void remove(r)}>
                      O‘chirish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RegionForm
          region={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            ui.success('Saqlandi');
            void regions.reload(true);
          }}
        />
      )}
    </>
  );
}

function RegionForm({ region, onClose, onSaved }: { region: Region | null; onClose(): void; onSaved(): void }) {
  const [code, setCode] = useState(region?.code ?? '');
  const [name, setName] = useState(region?.name ?? '');
  const [defaultTz, setDefaultTz] = useState(region?.defaultTimezone ?? DEFAULT_TZ);
  const [zones, setZones] = useState<string[]>(region?.timezones ?? []);
  const [addTz, setAddTz] = useState('UTC');
  const [isActive, setIsActive] = useState(region?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!region && !/^[A-Z]{2}$/.test(c)) return setError('Kod 2 harfli ISO kod bo‘lishi kerak (masalan UZ)');
    if (name.trim().length < 2) return setError('Nomi kamida 2 belgi');
    // Standart zona har doim ro'yxatda bo'ladi
    const timezones = [...new Set([defaultTz, ...zones])];
    setBusy(true);
    setError(null);
    try {
      if (region) await regionsApi.update(region.code, { name: name.trim(), defaultTimezone: defaultTz, timezones, isActive });
      else await regionsApi.create({ code: c, name: name.trim(), defaultTimezone: defaultTz, timezones, isActive });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={region ? `${region.name} — tahrirlash` : 'Yangi davlat'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="region-form" disabled={busy}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </>
      }
    >
      <form id="region-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error field-wide pre">{error}</div>}
        <Field label="ISO kod *" hint="UZ, KZ, RU, US ...">
          <input
            value={code}
            disabled={!!region}
            maxLength={2}
            required
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="UZ"
          />
        </Field>
        <Field label="Nomi *">
          <input value={name} required maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="O‘zbekiston" />
        </Field>
        <Field label="Standart vaqt zonasi *" wide>
          <TimezoneSelect value={defaultTz} onChange={setDefaultTz} />
        </Field>

        <div className="field field-wide">
          <span className="field-label">Qo‘shimcha zonalar (ko‘p zonali davlatlar uchun)</span>
          <div className="chips">
            {zones
              .filter((z) => z !== defaultTz)
              .map((z) => (
                <span key={z} className="chip">
                  {z}
                  <button type="button" onClick={() => setZones((l) => l.filter((x) => x !== z))}>
                    ✕
                  </button>
                </span>
              ))}
          </div>
          <div className="row gap-sm">
            <TimezoneSelect value={addTz} onChange={setAddTz} />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setZones((l) => (l.includes(addTz) ? l : [...l, addTz]))}
            >
              Qo‘shish
            </button>
          </div>
        </div>

        <div className="field field-wide">
          <Toggle checked={isActive} onChange={setIsActive} label="Faol" />
        </div>
      </form>
    </Modal>
  );
}
