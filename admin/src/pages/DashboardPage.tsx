import { Link } from 'react-router-dom';
import { channelsApi, programsApi, publicApi } from '../api/endpoints';
import type { HealthResponse } from '../api/types';
import { ErrorBox, PageHeader, Spinner, UrlBadge } from '../components/ui';
import { fmtAgo, fmtHuman } from '../lib/format';
import { useLoad, useServerEvents, useStoredState } from '../lib/hooks';
import { DEFAULT_TZ, fmtTime } from '../lib/time';

const STATUS_TEXT = {
  PLAYING: { text: 'Efirda', tone: 'green' },
  FILLER: { text: 'Kutish ekrani', tone: 'yellow' },
  UNAVAILABLE: { text: 'Video ishlamayapti', tone: 'red' },
  OFF_AIR: { text: 'Efir yo‘q', tone: 'gray' },
} as const;

export function DashboardPage() {
  const [tz] = useStoredState('kidstv.tz', DEFAULT_TZ);

  // Barcha statistikalar parallel yuklanadi
  const stats = useLoad(async () => {
    const [channels, all, broken, unknown] = await Promise.all([
      channelsApi.list(),
      programsApi.list({ limit: 1 }),
      programsApi.list({ urlStatus: 'BROKEN', limit: 10 }),
      programsApi.list({ urlStatus: 'UNKNOWN', limit: 1 }),
    ]);
    return { channels, programsTotal: all.total, broken, unknownTotal: unknown.total };
  }, []);

  const health = useLoad<HealthResponse | null>(() => publicApi.health().catch(() => null), []);
  const guide = useLoad(() => publicApi.guide(tz), [tz]);

  // Jadval/URL o'zgarsa — "hozir efirda" bo'limi yangilanadi
  useServerEvents(['schedule.updated', 'program.updated', 'channels.changed'], () => {
    void guide.reload(true);
    void stats.reload(true);
  });

  const s = stats.data;
  const activeChannels = s?.channels.filter((c) => c.isActive).length ?? 0;

  return (
    <>
      <PageHeader
        title="Bosh sahifa"
        subtitle={`Tizim holati va hozirgi efir (${tz})`}
        actions={
          <button
            className="btn"
            onClick={() => {
              void stats.reload();
              void guide.reload();
              void health.reload();
            }}
          >
            ⟳ Yangilash
          </button>
        }
      />

      {stats.error && <ErrorBox text={stats.error} onRetry={() => stats.reload()} />}

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Kanallar</span>
          <span className="stat-value">{s ? `${activeChannels} / ${s.channels.length}` : '—'}</span>
          <span className="muted small">faol / jami</span>
        </div>
        <div className="stat">
          <span className="stat-label">Multfilmlar</span>
          <span className="stat-value">{s?.programsTotal ?? '—'}</span>
          <span className="muted small">{s ? `${s.unknownTotal} tasi tekshirilmagan` : ''}</span>
        </div>
        <div className={`stat ${s && s.broken.total > 0 ? 'stat-bad' : ''}`}>
          <span className="stat-label">Buzilgan URL</span>
          <span className="stat-value">{s?.broken.total ?? '—'}</span>
          <Link className="small" to="/programs?urlStatus=BROKEN">
            Ko‘rish →
          </Link>
        </div>
        <div className={`stat ${health.data && health.data.status !== 'ok' ? 'stat-warn' : ''}`}>
          <span className="stat-label">Server</span>
          <span className="stat-value">
            {health.loading ? '…' : health.data ? (health.data.status === 'ok' ? 'OK' : 'Qisman') : 'Ishlamayapti'}
          </span>
          {health.data && (
            <span className="muted small">
              DB: {health.data.checks.database} · Redis: {health.data.checks.redis} · {fmtHuman(health.data.uptimeSec)}
            </span>
          )}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Hozir efirda</h2>
            {guide.data && <span className="muted small">{fmtTime(guide.data.localTime, tz, true)}</span>}
          </div>
          {guide.loading && !guide.data && <Spinner />}
          {guide.error && <ErrorBox text={guide.error} onRetry={() => guide.reload()} />}
          {guide.data && guide.data.channels.length === 0 && <p className="muted">Faol kanal yo‘q</p>}
          <div className="now-list">
            {guide.data?.channels.map((g) => {
              const st = STATUS_TEXT[g.status];
              return (
                <div className="now-item" key={g.channel.id}>
                  <span className="ch-num">{g.channel.number}</span>
                  <div className="grow">
                    <div className="row between">
                      <b>{g.channel.title}</b>
                      <span className={`badge badge-${st.tone}`}>{st.text}</span>
                    </div>
                    {g.current ? (
                      <>
                        <div className="small">
                          {fmtTime(g.current.startsAtLocal, tz)}–{fmtTime(g.current.endsAtLocal, tz)} ·{' '}
                          {g.current.program.title}
                        </div>
                        <div className="progress">
                          <div style={{ width: `${Math.round(g.current.progress * 100)}%` }} />
                        </div>
                      </>
                    ) : (
                      <div className="small muted">Hozir dastur yo‘q</div>
                    )}
                    {g.next && (
                      <div className="small muted">
                        Keyin: {fmtTime(g.next.startsAtLocal, tz)} — {g.next.program.title}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Ishlamayotgan URL’lar</h2>
            <Link to="/programs?urlStatus=BROKEN" className="small">
              Hammasi →
            </Link>
          </div>
          {s && s.broken.items.length === 0 && <p className="muted">Barcha tekshirilgan URL’lar ishlayapti 🎉</p>}
          <ul className="plain-list">
            {s?.broken.items.map((p) => (
              <li key={p.id}>
                <div className="row between">
                  <b>{p.title}</b>
                  <UrlBadge status={p.urlStatus} />
                </div>
                <div className="small muted ellipsis" title={p.urlError ?? ''}>
                  {p.urlError ?? 'Sabab noma’lum'} · {fmtAgo(p.urlCheckedAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
