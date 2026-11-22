import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorText } from '../api/client';
import { channelsApi, type ChannelInput } from '../api/endpoints';
import { AGE_GROUPS, AGE_LABEL, type AgeGroup, type Channel } from '../api/types';
import { useUi } from '../components/Toast';
import { AgeBadge, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, Toggle } from '../components/ui';
import { optional, slugify } from '../lib/format';
import { useLoad } from '../lib/hooks';

export function ChannelsPage() {
  const ui = useUi();
  const { data, error, loading, reload } = useLoad(() => channelsApi.list(), []);
  const [editing, setEditing] = useState<Channel | 'new' | null>(null);

  const toggleActive = async (c: Channel) => {
    try {
      await channelsApi.setActive(c.id, !c.isActive);
      ui.success(c.isActive ? `«${c.title}» o‘chirildi (efirdan olindi)` : `«${c.title}» yoqildi`);
      void reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  const remove = async (c: Channel) => {
    const ok = await ui.confirm({
      title: `«${c.title}» kanalini o‘chirish`,
      text: `Kanal va uning jadvalidagi ${c._count?.slots ?? 0} ta slot butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.\n\nVaqtincha yashirish uchun "Faol" tugmasini o‘chirish kifoya.`,
      confirmLabel: 'O‘chirish',
      danger: true,
    });
    if (!ok) return;
    try {
      await channelsApi.remove(c.id);
      ui.success('Kanal o‘chirildi');
      void reload(true);
    } catch (e) {
      ui.error(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Kanallar"
        subtitle="Mobil ilovadagi kanallar ro‘yxati. Tartib raqami ilovadagi tartibni belgilaydi."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            ＋ Yangi kanal
          </button>
        }
      />

      {error && <ErrorBox text={error} onRetry={() => reload()} />}
      {loading && !data && <Spinner />}
      {data && data.length === 0 && <Empty>Hali kanal yo‘q. Birinchi kanalni yarating.</Empty>}

      {data && data.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>№</th>
                <th>Kanal</th>
                <th>Slug</th>
                <th>Yosh</th>
                <th>Slotlar</th>
                <th>Faol</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className={c.isActive ? '' : 'row-muted'}>
                  <td>
                    <span className="ch-num">{c.number}</span>
                  </td>
                  <td>
                    <div className="row gap-sm">
                      {c.logoUrl ? <img className="logo" src={c.logoUrl} alt="" /> : <span className="logo-ph">📺</span>}
                      <div>
                        <b>{c.title}</b>
                        {c.description && <div className="small muted ellipsis">{c.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="mono small">{c.slug}</td>
                  <td>
                    <AgeBadge age={c.ageGroup} />
                  </td>
                  <td>
                    <Link to={`/schedule?channel=${c.id}`}>{c._count?.slots ?? 0} ta →</Link>
                  </td>
                  <td>
                    <Toggle checked={c.isActive} onChange={() => void toggleActive(c)} />
                  </td>
                  <td className="actions">
                    <button className="btn btn-sm" onClick={() => setEditing(c)}>
                      Tahrirlash
                    </button>
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => void remove(c)}>
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
        <ChannelForm
          channel={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload(true);
          }}
        />
      )}
    </>
  );
}

function ChannelForm({ channel, onClose, onSaved }: { channel: Channel | null; onClose(): void; onSaved(): void }) {
  const ui = useUi();
  const [title, setTitle] = useState(channel?.title ?? '');
  const [slug, setSlug] = useState(channel?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!channel);
  const [number, setNumber] = useState(channel ? String(channel.number) : '');
  const [description, setDescription] = useState(channel?.description ?? '');
  const [logoUrl, setLogoUrl] = useState(channel?.logoUrl ?? '');
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(channel?.ageGroup ?? 'ALL');
  const [isActive, setIsActive] = useState(channel?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: ChannelInput = {
      title: title.trim(),
      slug: optional(slug),
      number: number ? Number(number) : undefined,
      // Tahrirda bo'sh qator — tavsifni tozalash
      description: channel ? description.trim() : optional(description),
      logoUrl: optional(logoUrl),
      ageGroup,
      isActive,
    };
    try {
      if (channel) await channelsApi.update(channel.id, body);
      else await channelsApi.create(body);
      ui.success(channel ? 'Kanal saqlandi' : 'Kanal yaratildi');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={channel ? `Kanalni tahrirlash: ${channel.title}` : 'Yangi kanal'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn btn-primary" form="channel-form" disabled={busy}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </>
      }
    >
      <form id="channel-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert alert-error field-wide pre">{error}</div>}
        <Field label="Nomi *" wide>
          <input
            required
            minLength={2}
            maxLength={120}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            autoFocus
          />
        </Field>
        <Field label="Slug (URL uchun)" hint="Ilovada /channels/slug ko‘rinishida ishlatiladi">
          <input
            value={slug}
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </Field>
        <Field label="Tartib raqami" hint="Bo‘sh qolsa — oxirgisidan keyingi">
          <input type="number" min={1} max={9999} value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Yosh toifasi">
          <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {AGE_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Holat">
          <Toggle checked={isActive} onChange={setIsActive} label={isActive ? 'Faol (ilovada ko‘rinadi)' : 'Nofaol'} />
        </Field>
        <Field label="Logo URL" wide>
          <input type="url" placeholder="https://..." value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </Field>
        <Field label="Tavsif" wide>
          <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
