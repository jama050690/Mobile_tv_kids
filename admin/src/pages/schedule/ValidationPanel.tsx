import type { ValidationResult } from '../../api/types';
import { Spinner } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { fmtTime } from '../../lib/time';

/**
 * Kun jadvalini tekshirish natijasi: qamrov %, bo'sh oraliqlar (bosib — slot qo'shish),
 * muammolar (bosib — slotni ochish).
 */
export function ValidationPanel({
  data,
  error,
  loading,
  tz,
  onGapClick,
  onIssueClick,
}: {
  data: ValidationResult | null;
  error: string | null;
  loading: boolean;
  tz: string;
  onGapClick(fromMs: number): void;
  onIssueClick(slotId: string): void;
}) {
  if (loading && !data) return <Spinner />;
  if (error) return <div className="alert alert-error small">{error}</div>;
  if (!data) return null;

  const pct = Math.round(data.coveragePercent * 10) / 10;
  const tone = pct >= 99 ? 'ok' : pct >= 80 ? 'warn' : 'bad';

  return (
    <div className="validation stack-sm">
      <div className={`coverage coverage-${tone}`}>
        <div className="between row">
          <b>Qamrov</b>
          <b>{pct}%</b>
        </div>
        <div className="progress">
          <div style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="small muted">
          {data.slots} ta slot · {data.gaps.length} ta bo‘shliq · {data.issues.length} ta ogohlantirish
        </div>
      </div>

      {data.gaps.length > 0 && (
        <div>
          <h4>Bo‘sh oraliqlar</h4>
          <ul className="plain-list issue-list">
            {data.gaps.map((g) => (
              <li key={g.fromUtc}>
                <button type="button" className="link-btn" onClick={() => onGapClick(Date.parse(g.fromUtc))}>
                  <span className="mono">
                    {fmtTime(g.fromUtc, tz)}–{fmtTime(g.toUtc, tz)}
                  </span>
                  <span className="muted"> · {fmtDuration(g.durationSec)}</span>
                  <span className="ml">＋</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.issues.length > 0 && (
        <div>
          <h4>Ogohlantirishlar</h4>
          <ul className="plain-list issue-list">
            {data.issues.map((i, n) => (
              <li key={`${i.slotId}-${i.code}-${n}`}>
                <button type="button" className="link-btn" onClick={() => onIssueClick(i.slotId)}>
                  {i.slotStartsAtUtc && <span className="mono">{fmtTime(i.slotStartsAtUtc, tz)} </span>}
                  <b>{i.programTitle}</b>
                  <div className="small muted">{i.message}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.isValid && data.gaps.length === 0 && <p className="small ok">✓ Jadval to‘liq va muammosiz</p>}
    </div>
  );
}
