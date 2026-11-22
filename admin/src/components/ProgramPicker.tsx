import { useEffect, useState } from 'react';
import { errorText } from '../api/client';
import { programsApi } from '../api/endpoints';
import type { Program } from '../api/types';
import { fmtDuration } from '../lib/format';
import { useDebounced } from '../lib/hooks';
import { AgeBadge, UrlBadge } from './ui';

/**
 * Multfilm tanlash: qidiruv + ro'yxat (serverda qidiriladi, katta kutubxona uchun ham tez).
 * Faqat faol dasturlar ko'rsatiladi.
 */
export function ProgramPicker({
  selectedId,
  onSelect,
  multi,
}: {
  selectedId?: string | null;
  onSelect(p: Program): void;
  /** Ketma-ket qo'shishda: tanlangan elementlar belgilanmaydi, har bosishda qo'shiladi */
  multi?: boolean;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const [items, setItems] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    programsApi
      .list({ search: q || undefined, isActive: true, limit: 50 }, ctrl.signal)
      .then((r) => {
        setItems(r.items);
        setError(null);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(errorText(e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q]);

  return (
    <div className="picker">
      <input
        type="search"
        placeholder="Multfilm nomi bo'yicha qidirish..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="picker-list">
        {error && <div className="field-error">{error}</div>}
        {!error && !loading && items.length === 0 && <div className="muted pad">Hech narsa topilmadi</div>}
        {items.map((p) => (
          <button
            type="button"
            key={p.id}
            className={`picker-item ${!multi && selectedId === p.id ? 'active' : ''}`}
            onClick={() => onSelect(p)}
          >
            {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" loading="lazy" /> : <span className="thumb-ph">🎬</span>}
            <span className="picker-main">
              <b>{p.title}</b>
              <span className="row gap-sm wrap">
                <span className="mono">{fmtDuration(p.durationSec)}</span>
                <span className="muted">{p.streamType}</span>
                <AgeBadge age={p.ageRating} />
                {p.urlStatus !== 'OK' && <UrlBadge status={p.urlStatus} />}
              </span>
            </span>
            {multi && <span className="picker-add">＋</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
