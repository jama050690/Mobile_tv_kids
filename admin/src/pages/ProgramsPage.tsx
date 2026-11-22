import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorText } from '../api/client';
import { programsApi, type ProgramInput } from '../api/endpoints';
import {
  AGE_GROUPS,
  AGE_LABEL,
  type AgeGroup,
  type Program,
  type ProgramCheckResult,
  type StreamType,
  type UrlCheckResult,
  type UrlHealth,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useUi } from '../components/Toast';
import { ActiveBadge, AgeBadge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle, UrlBadge } from '../components/ui';
import { fmtAgo, fmtDuration, optional, parseDuration } from '../lib/format';
import { useDebounced, useLoad, useServerEvents } from '../lib/hooks';

const PAGE_SIZE = 25;

export function ProgramsPage() {
  const ui = useUi();
  const { isSuper } = useAuth();
  const [params, setParams] = useSearchParams();

  // Filtrlar URL'da saqlanadi (dashboard'dan ?urlStatus=BROKEN bilan kelish mumkin)
  const [search, setSearch] = useState(params.get('search') ?? '');
  const q = useDebounced(search, 300);
  const urlStatus = (params.get('urlStatus') as UrlHealth | null) ?? undefined;
  const ageRating = (params.get('ageRating') as AgeGroup | null) ?? undefined;
  const active = params.get('active');
  const page = Number(params.get('page') ?? 1);

  const setParam = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, error, loading, reload } = useLoad(
    () =>
      programsApi.list({
        search: q || undefined,
        urlStatus,
        ageRating,
        isActive: active === 'true' ? true : active === 'false' ? false : undefined,
        page,
        limit: PAGE_SIZE,
      }),
    [q, urlStatus, ageRating, active, page],
  );

  // Fon tekshiruvi URL holatini o'zgartirsa — ro'yxat yangilanadi
  useServerEvents(['program.updated'], () => void reload(true));

  const [editing, setEditing] = useState<Program | 'new' | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<{ program: Program; result: ProgramCheckResult } | null>(null);

  const check = async (p: Program) => {
    setChecking(p.id);
    try {
      const result = await programsApi.checkProgram(p.id);
      setCheckResult({ program: p, result });
      void reload(true);
    } catch (e) {
      ui.error(errorText(e));
    } finally {
      setChecking(null);
    }
  };

  const checkAll = async () => {
    const ok = await ui.confirm({
      title: 'Barcha URL’larni tekshirish',
      text: 'Barcha faol multfilmlar havolalari tekshiriladi. Bu bir necha daqiqa olishi mumkin.',
      confirmLabel: 'Boshlash',
    });
    if (!ok) return;
    ui.toast('Tekshiruv boshlandi...');
    try {
      const r = await programsApi.checkAll();
      if ('skipped' in r) ui.toast(r.reason, 'warning');
      else ui.success(`Tekshirildi: ${r.checked} ta, buzilgan: ${r.broken} ta`);
      void reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  const remove = async (p: Program) => {
    const ok = await ui.confirm({
      title: `«${p.title}» ni o‘chirish`,
      text: 'Agar multfilm jadvalda ishlatilgan bo‘lsa, o‘chirib bo‘lmaydi — avval slotlarni o‘chiring yoki uni nofaol qiling.',
      confirmLabel: 'O‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      await programsApi.remove(p.id);
      ui.success('O‘chirildi');
      void reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Multfilmlar"
        subtitle="Kontent bazasi: video havolalari (HLS .m3u8 / MP4), davomiylik, yosh toifasi"
        actions={
          <>
            {isSuper && (
              <button className="btn" onClick={() => void checkAll()}>
                🔍 Hammasini tekshirish
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              ＋ Yangi multfilm
            </button>
          </>
        }
      />

      <div className="filters card">
        <input
          type="search"
          placeholder="Nomi bo‘yicha qidirish..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setParam('page', undefined);
          }}
        />
        <select value={urlStatus ?? ''} onChange={(e) => setParam('urlStatus', e.target.value || undefined)}>
          <option value="">URL: hammasi</option>
          <option value="OK">Ishlaydi</option>
          <option value="BROKEN">Buzilgan</option>
          <option value="UNKNOWN">Tekshirilmagan</option>
        </select>
        <select value={ageRating ?? ''} onChange={(e) => setParam('ageRating', e.target.value || undefined)}>
          <option value="">Yosh: hammasi</option>
          {AGE_GROUPS.map((a) => (
            <option key={a} value={a}>
              {AGE_LABEL[a]}
            </option>
          ))}
        </select>
        <select value={active ?? ''} onChange={(e) => setParam('active', e.target.value || undefined)}>
          <option value="">Holat: hammasi</option>
          <option value="true">Faol</option>
          <option value="false">Nofaol</option>
        </select>
      </div>

      {error && <ErrorBox text={error} onRetry={() => reload()} />}
      {loading && !data && <Spinner />}
      {data && data.items.length === 0 && <Empty>Multfilm topilmadi</Empty>}

      {data && data.items.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>Multfilm</th>
                <th>Turi</th>
                <th>Davomiylik</th>
                <th>Yosh</th>
                <th>URL holati</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'row-muted'}>
                  <td>
                    <div className="row gap-sm">
                      {p.thumbnailUrl ? (
                        <img className="thumb" src={p.thumbnailUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="thumb-ph">🎬</span>
                      )}
                      <div className="min0">
                        <b>{p.title}</b>
                        <div className="small muted ellipsis mono" title={p.videoUrl}>
                          {p.videoUrl}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {p.streamType}
                    {p.isLiveStream && <span className="badge badge-red ml">LIVE</span>}
                    {p.fallbackUrl && (
                      <div className="small muted" title={p.fallbackUrl}>
                        + zaxira
                      </div>
                    )}
                  </td>
                  <td className="mono">{fmtDuration(p.durationSec)}</td>
                  <td>
                    <AgeBadge age={p.ageRating} />
                  </td>
                  <td>
                    <UrlBadge status={p.urlStatus} title={p.urlError} />
                    <div className="small muted">{fmtAgo(p.urlCheckedAt)}</div>
                  </td>
                  <td>
                    <ActiveBadge active={p.isActive} />
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" disabled={checking === p.id} onClick={() => void check(p)}>
                      {checking === p.id ? '...' : 'Tekshirish'}
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(p)}>
                      Tahrirlash
                    </button>
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => void remove(p)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span className="muted small">Jami: {data.total} ta</span>
            <div className="row gap-sm">
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
                ← Oldingi
              </button>
              <span className="small">
                {data.page} / {Math.max(1, data.pages)}
              </span>
              <button
                className="btn btn-sm"
                disabled={page >= data.pages}
                onClick={() => setParam('page', String(page + 1))}
              >
                Keyingi →
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <ProgramForm
          program={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload(true);
          }}
        />
      )}

      {checkResult && (
        <Modal title={`URL tekshiruvi: ${checkResult.program.title}`} onClose={() => setCheckResult(null)} size="lg">
          <h4>Asosiy URL</h4>
          <CheckResultView r={checkResult.result.primary} />
          {checkResult.result.fallback && (
            <>
              <h4>Zaxira URL</h4>
              <CheckResultView r={checkResult.result.fallback} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/** URL tekshiruv natijasi kartasi */
export function CheckResultView({ r }: { r: UrlCheckResult }) {
  return (
    <div className={`check-result ${r.ok ? 'ok' : 'bad'}`}>
      <div className="row between">
        <UrlBadge status={r.status} />
        <span className="muted small">{r.latencyMs} ms</span>
      </div>
      {r.error && <div className="alert alert-error">{r.error}</div>}
      <dl className="kv">
        <dt>Format</dt>
        <dd>{r.streamType ?? '—'}</dd>
        <dt>HTTP</dt>
        <dd>{r.httpStatus ?? '—'}</dd>
        <dt>Content-Type</dt>
        <dd className="mono small">{r.contentType ?? '—'}</dd>
        <dt>Davomiylik</dt>
        <dd>{r.detectedDurationSec ? fmtDuration(r.detectedDurationSec) : '—'}</dd>
        <dt>Jonli oqim</dt>
        <dd>{r.isLive === null ? '—' : r.isLive ? 'Ha' : 'Yo‘q'}</dd>
        <dt>Seek (Range)</dt>
        <dd>{r.supportsRange === null ? '—' : r.supportsRange ? 'Qo‘llanadi' : 'Yo‘q'}</dd>
        {r.finalUrl && r.finalUrl !== r.url && (
          <>
            <dt>Redirect</dt>
            <dd className="mono small ellipsis" title={r.finalUrl}>
              {r.finalUrl}
            </dd>
          </>
        )}
      </dl>
      {r.warnings.length > 0 && (
        <ul className="warn-list">
          {r.warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgramForm({ program, onClose, onSaved }: { program: Program | null; onClose(): void; onSaved(): void }) {
  const ui = useUi();
  const [title, setTitle] = useState(program?.title ?? '');
  const [description, setDescription] = useState(program?.description ?? '');
  const [videoUrl, setVideoUrl] = useState(program?.videoUrl ?? '');
  const [fallbackUrl, setFallbackUrl] = useState(program?.fallbackUrl ?? '');
  const [streamType, setStreamType] = useState<StreamType | ''>(program?.streamType ?? '');
  const [isLiveStream, setIsLiveStream] = useState(program?.isLiveStream ?? false);
  const [duration, setDuration] = useState(program ? fmtDuration(program.durationSec) : '');
  const [thumbnailUrl, setThumbnailUrl] = useState(program?.thumbnailUrl ?? '');
  const [ageRating, setAgeRating] = useState<AgeGroup>(program?.ageRating ?? 'ALL');
  const [isActive, setIsActive] = useState(program?.isActive ?? true);
  const [checkAfterSave, setCheckAfterSave] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [check, setCheck] = useState<UrlCheckResult | null>(null);

  const durationSec = parseDuration(duration);

  /** URL'ni saqlamasdan tekshirish: formatni va davomiylikni avtomatik to'ldiradi */
  const testUrl = async () => {
    if (!videoUrl.trim()) return;
    setCheckBusy(true);
    setCheck(null);
    try {
      const r = await programsApi.checkUrl(videoUrl.trim(), streamType || undefined);
      setCheck(r);
      if (r.ok) {
        if (r.streamType && !streamType) setStreamType(r.streamType);
        if (r.detectedDurationSec && !duration) setDuration(fmtDuration(r.detectedDurationSec));
        if (r.isLive) setIsLiveStream(true);
      }
    } catch (e) {
      ui.error(errorText(e));
    } finally {
      setCheckBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!durationSec || durationSec < 1) {
      setError('Davomiylikni kiriting: masalan 9:56 yoki 1:02:05 (yoki soniyada)');
      return;
    }
    setBusy(true);
    setError(null);
    const body: ProgramInput = {
      title: title.trim(),
      description: program ? description.trim() : optional(description),
      videoUrl: videoUrl.trim(),
      fallbackUrl: optional(fallbackUrl),
      streamType: streamType || undefined,
      isLiveStream,
      durationSec,
      thumbnailUrl: optional(thumbnailUrl),
      ageRating,
      isActive,
      checkUrl: checkAfterSave,
    };
    try {
      if (program) await programsApi.update(program.id, body);
      else await programsApi.create(body);
      ui.success(program ? 'Saqlandi' : 'Multfilm qo‘shildi');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={program ? `Tahrirlash: ${program.title}` : 'Yangi multfilm'}
      onClose={onClose}
      footer={
        <>
          <label className="row gap-sm small grow">
            <input type="checkbox" checked={checkAfterSave} onChange={(e) => setCheckAfterSave(e.target.checked)} />
            Saqlagandan keyin URL’ni tekshirish
          </label>
          <button className="btn" type="button" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="program-form" disabled={busy}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </>
      }
    >
      <form id="program-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error field-wide pre">{error}</div>}
        <Field label="Nomi *" wide>
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>

        <Field label="Video URL * (.m3u8 yoki .mp4)" wide hint="Faqat https. Xavfli yoki ichki tarmoq manzillari rad etiladi.">
          <div className="row gap-sm">
            <input
              className="grow mono"
              type="url"
              required
              placeholder="https://cdn.example.com/video/index.m3u8"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setCheck(null);
              }}
            />
            <button type="button" className="btn" disabled={checkBusy || !videoUrl} onClick={() => void testUrl()}>
              {checkBusy ? 'Tekshirilmoqda...' : 'Tekshirish'}
            </button>
          </div>
        </Field>
        {check && (
          <div className="field-wide">
            <CheckResultView r={check} />
          </div>
        )}

        <Field label="Zaxira URL" wide hint="Asosiy havola ishlamasa ilova shunga o‘tadi">
          <input
            className="mono"
            type="url"
            placeholder="https://..."
            value={fallbackUrl}
            onChange={(e) => setFallbackUrl(e.target.value)}
          />
        </Field>

        <Field label="Format" hint="Bo‘sh qolsa URL’dan aniqlanadi">
          <select value={streamType} onChange={(e) => setStreamType(e.target.value as StreamType | '')}>
            <option value="">Avtomatik</option>
            <option value="HLS">HLS (.m3u8)</option>
            <option value="MP4">MP4</option>
          </select>
        </Field>
        <Field
          label="Davomiylik *"
          error={duration && !durationSec ? 'Format: 9:56 yoki 1:02:05' : null}
          hint={durationSec ? `${durationSec} soniya` : '“Tekshirish” HLS uchun avtomatik to‘ldiradi'}
        >
          <input
            className="mono"
            required
            placeholder="mm:ss"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
        <Field label="Yosh toifasi">
          <select value={ageRating} onChange={(e) => setAgeRating(e.target.value as AgeGroup)}>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {AGE_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parametrlar">
          <div className="stack-sm">
            <Toggle checked={isActive} onChange={setIsActive} label="Faol" />
            <Toggle checked={isLiveStream} onChange={setIsLiveStream} label="Jonli oqim (seek yo‘q)" />
          </div>
        </Field>

        <Field label="Rasm (thumbnail) URL" wide>
          <input type="url" placeholder="https://..." value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
        </Field>
        <Field label="Tavsif" wide>
          <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
