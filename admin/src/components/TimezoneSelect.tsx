import { useMemo } from 'react';
import { allTimezones, offsetLabel } from '../lib/time';

/** Tez tanlash uchun asosiy zonalar (davlatlar ro'yxatidagi zonalar bilan to'ldiriladi) */
const POPULAR = ['Asia/Tashkent', 'Asia/Almaty', 'Asia/Bishkek', 'Asia/Dushanbe', 'Europe/Moscow', 'Europe/Istanbul', 'UTC'];

export function TimezoneSelect({
  value,
  onChange,
  extra = [],
  id,
}: {
  value: string;
  onChange(tz: string): void;
  /** Bazadagi davlatlar zonalari — ro'yxat boshida chiqadi */
  extra?: string[];
  id?: string;
}) {
  const { top, rest } = useMemo(() => {
    const topSet = new Set([...extra, ...POPULAR, value]);
    const top = [...topSet];
    const rest = allTimezones().filter((z) => !topSet.has(z));
    return { top, rest };
  }, [extra, value]);

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Asosiy">
        {top.map((z) => (
          <option key={z} value={z}>
            {z} ({offsetLabel(z)})
          </option>
        ))}
      </optgroup>
      <optgroup label="Barcha zonalar">
        {rest.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
