import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

interface ConfirmRequest {
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve(ok: boolean): void;
}

interface UiApi {
  toast(text: string, kind?: Kind): void;
  success(text: string): void;
  error(text: string): void;
  /** Tasdiqlash oynasi: await confirm({...}) -> true/false */
  confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean>;
}

const UiContext = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, kind: Kind = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);

  const confirm = useCallback(
    (opts: Omit<ConfirmRequest, 'resolve'>) => new Promise<boolean>((resolve) => setConfirmReq({ ...opts, resolve })),
    [],
  );

  const api = useMemo<UiApi>(
    () => ({
      toast,
      success: (t) => toast(t, 'success'),
      error: (t) => toast(t, 'error'),
      confirm,
    }),
    [toast, confirm],
  );

  const closeConfirm = (ok: boolean) => {
    confirmReq?.resolve(ok);
    setConfirmReq(null);
  };

  return (
    <UiContext.Provider value={api}>
      {children}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
          >
            {t.text}
          </div>
        ))}
      </div>

      {confirmReq && (
        <div className="modal-backdrop" onMouseDown={() => closeConfirm(false)}>
          <div className="modal modal-sm" role="alertdialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{confirmReq.title}</h3>
            </div>
            {confirmReq.text && <div className="modal-body"><p className="pre">{confirmReq.text}</p></div>}
            <div className="modal-foot">
              <button className="btn" onClick={() => closeConfirm(false)}>
                Bekor qilish
              </button>
              <button
                autoFocus
                className={`btn ${confirmReq.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmReq.confirmLabel ?? 'Tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UiContext.Provider>
  );
}

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi UiProvider ichida ishlatilishi kerak');
  return ctx;
}
