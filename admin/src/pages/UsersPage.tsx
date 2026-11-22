import { useState, type FormEvent } from 'react';
import { errorText } from '../api/client';
import { usersApi, type AdminUserInput } from '../api/endpoints';
import { ROLE_LABEL, type Admin, type AdminRole } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useUi } from '../components/Toast';
import { ActiveBadge, Badge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../components/ui';
import { fmtAgo } from '../lib/format';
import { useLoad } from '../lib/hooks';

/** Backend bilan bir xil parol qoidasi */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

/** Administratorlar (faqat super admin) */
export function UsersPage() {
  const ui = useUi();
  const { admin: me } = useAuth();
  const users = useLoad(() => usersApi.list(), []);
  const [editing, setEditing] = useState<Admin | 'new' | null>(null);

  const remove = async (u: Admin) => {
    const ok = await ui.confirm({
      title: 'Administratorni o‘chirish',
      text: `${u.email} butunlay o‘chiriladi va barcha sessiyalari yopiladi.`,
      confirmLabel: 'O‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      await usersApi.remove(u.id);
      ui.success('O‘chirildi');
      void users.reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Administratorlar"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            ＋ Administrator
          </button>
        }
      />

      {users.loading && !users.data ? (
        <Spinner />
      ) : users.error ? (
        <ErrorBox text={users.error} onRetry={() => void users.reload()} />
      ) : !users.data?.length ? (
        <Empty>Administratorlar yo‘q.</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Ism</th>
                <th>Rol</th>
                <th>Holat</th>
                <th>Oxirgi kirish</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.isActive === false ? 'row-muted' : ''}>
                    <td>
                      {u.email} {isMe && <Badge tone="blue">siz</Badge>}
                    </td>
                    <td>{u.fullName || <span className="muted">—</span>}</td>
                    <td>
                      <Badge tone={u.role === 'SUPER_ADMIN' ? 'pink' : 'gray'}>{ROLE_LABEL[u.role]}</Badge>
                    </td>
                    <td>
                      <ActiveBadge active={u.isActive !== false} />
                    </td>
                    <td className="small">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : <span className="muted">hech qachon</span>}</td>
                    <td className="actions">
                      <button className="btn btn-sm" onClick={() => setEditing(u)}>
                        Tahrirlash
                      </button>
                      {!isMe && (
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => void remove(u)}>
                          O‘chirish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          isMe={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            ui.success('Saqlandi');
            void users.reload(true);
          }}
        />
      )}
    </>
  );
}

function UserForm({
  user,
  isMe,
  onClose,
  onSaved,
}: {
  user: Admin | null;
  isMe: boolean;
  onClose(): void;
  onSaved(): void;
}) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [role, setRole] = useState<AdminRole>(user?.role ?? 'CONTENT_MANAGER');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(user?.isActive !== false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwdBad = password !== '' && !PASSWORD_RULE.test(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user && !password) return setError('Parol majburiy');
    if (pwdBad) return setError('Parol kamida 10 belgi, katta va kichik harf hamda raqamdan iborat bo‘lishi kerak');
    if (fullName.trim() && fullName.trim().length < 2) return setError('Ism kamida 2 belgi');

    const body: AdminUserInput = {
      email: email.trim().toLowerCase(),
      fullName: fullName.trim() || undefined,
      role,
    };
    if (password) body.password = password;

    setBusy(true);
    setError(null);
    try {
      if (user) await usersApi.update(user.id, { ...body, ...(isMe ? {} : { isActive }) });
      else await usersApi.create(body);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? 'Administratorni tahrirlash' : 'Yangi administrator'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="user-form" disabled={busy}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit} autoComplete="off">
        {error && <div className="alert alert-error field-wide pre">{error}</div>}
        <Field label="Email *" wide>
          <input type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="To‘liq ism">
          <input maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Rol" hint={isMe ? 'O‘z rolingizni o‘zgartirsangiz, bu sahifaga kira olmay qolasiz' : undefined}>
          <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {(Object.keys(ROLE_LABEL) as AdminRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={user ? 'Yangi parol (o‘zgartirmaslik uchun bo‘sh qoldiring)' : 'Parol *'}
          hint="Kamida 10 belgi, katta va kichik harf, raqam"
          error={pwdBad ? 'Parol talabga javob bermaydi' : undefined}
          wide
        >
          <input
            type="password"
            autoComplete="new-password"
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {user && !isMe && (
          <div className="field field-wide">
            <Toggle checked={isActive} onChange={setIsActive} label="Faol (o‘chirilsa — tizimga kira olmaydi)" />
          </div>
        )}
      </form>
    </Modal>
  );
}
