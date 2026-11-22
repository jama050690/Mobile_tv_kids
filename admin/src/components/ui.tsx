import { useEffect, type ReactNode } from 'react';
import { AGE_LABEL, type AgeGroup, type SlotStatus, type UrlHealth } from '../api/types';

// ---------------- Modal ----------------
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  // Esc bilan yopish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- Forma maydoni ----------------
export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? 'field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

// ---------------- Holat belgilar ----------------
export function Badge({ tone = 'gray', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

const URL_TONE: Record<UrlHealth, string> = { OK: 'green', BROKEN: 'red', UNKNOWN: 'gray' };
const URL_TEXT: Record<UrlHealth, string> = { OK: 'Ishlaydi', BROKEN: 'Buzilgan', UNKNOWN: 'Tekshirilmagan' };
export function UrlBadge({ status, title }: { status: UrlHealth; title?: string | null }) {
  return (
    <Badge tone={URL_TONE[status]} title={title ?? undefined}>
      {status === 'OK' ? '●' : status === 'BROKEN' ? '✕' : '○'} {URL_TEXT[status]}
    </Badge>
  );
}

export function AgeBadge({ age }: { age: AgeGroup }) {
  const tone = age === 'AGE_0_3' ? 'pink' : age === 'AGE_4_7' ? 'yellow' : age === 'AGE_8_12' ? 'blue' : 'gray';
  return <Badge tone={tone}>{AGE_LABEL[age]}</Badge>;
}

const SLOT_TEXT: Record<SlotStatus, string> = { SCHEDULED: 'Rejada', LIVE: 'Efirda', ENDED: 'Tugagan' };
export function SlotStatusBadge({ status }: { status: SlotStatus }) {
  return <Badge tone={status === 'LIVE' ? 'red' : status === 'ENDED' ? 'gray' : 'blue'}>{SLOT_TEXT[status]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'green' : 'gray'}>{active ? 'Faol' : 'Nofaol'}</Badge>;
}

// ---------------- Holatlar ----------------
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" /> {label ?? 'Yuklanmoqda...'}
    </div>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?(): void }) {
  return (
    <div className="alert alert-error">
      <span>{text}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
