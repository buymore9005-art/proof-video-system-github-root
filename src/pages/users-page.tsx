import { KeyRound, Plus, RefreshCw, ShieldCheck, UserRoundCog } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/date';
import { errorMessage } from '../lib/format';
import { useAuth } from '../providers/auth-provider';
import { useToast } from '../providers/toast-provider';
import type { Profile, UserRole } from '../types/database';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';

interface CreateUserForm {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

const emptyForm: CreateUserForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'operator',
};

export function UsersPage() {
  const { profile: currentProfile } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateUserForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<{ users: Profile[] }>('/api/users');
      setUsers(result.users);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(form) });
      showToast('Pengguna berhasil dibuat.', 'success');
      setForm(emptyForm);
      setCreateOpen(false);
      await load();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateUser = async (user: Profile, patch: Partial<Pick<Profile, 'full_name' | 'role' | 'is_active'>>) => {
    try {
      await apiRequest('/api/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: user.id, ...patch }),
      });
      showToast('Data pengguna diperbarui.', 'success');
      await load();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordUser) return;
    setSubmitting(true);
    try {
      await apiRequest('/api/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId: passwordUser.id, password: newPassword }),
      });
      showToast('Password berhasil diganti.', 'success');
      setPasswordUser(null);
      setNewPassword('');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Buat akun Petugas, atur role, status akun, dan password."
        actions={
          <div className="inline-actions">
            <Button type="button" variant="secondary" onClick={() => void load()}><RefreshCw size={17} /> Muat ulang</Button>
            <Button type="button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Pengguna Baru</Button>
          </div>
        }
      />
      <Card title="Daftar Pengguna">
        {loading ? <Spinner label="Memuat pengguna" /> : users.length === 0 ? (
          <EmptyState title="Belum ada pengguna" description="Buat pengguna pertama setelah Admin." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Terakhir aktif</th><th>Aksi</th></tr></thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentProfile?.id;
                  return (
                    <tr key={user.id}>
                      <td><strong>{user.full_name}</strong>{isSelf ? <small>Akun Anda</small> : null}</td>
                      <td>{user.email}</td>
                      <td>
                        <Select
                          value={user.role}
                          disabled={isSelf}
                          onChange={(event) => void updateUser(user, { role: event.target.value as UserRole })}
                          aria-label={`Role ${user.full_name}`}
                        >
                          <option value="operator">Operator</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </td>
                      <td><Badge tone={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'Aktif' : 'Nonaktif'}</Badge></td>
                      <td>{formatDateTime(user.last_seen_at)}</td>
                      <td>
                        <div className="table-actions">
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setPasswordUser(user); setNewPassword(''); }} title="Ganti password"><KeyRound size={16} /></Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => void updateUser(user, { is_active: !user.is_active })}
                          >
                            {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={createOpen} title="Buat Pengguna Baru" onClose={() => setCreateOpen(false)}>
        <form className="form-stack" onSubmit={createUser}>
          <Field label="Nama lengkap"><Input value={form.fullName} onChange={(event) => setForm((value) => ({ ...value, fullName: event.target.value }))} minLength={2} maxLength={120} required /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required /></Field>
          <Field label="Password awal" hint="Minimal 10 karakter."><Input type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} minLength={10} required /></Field>
          <Field label="Role"><Select value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as UserRole }))}><option value="operator">Operator</option><option value="admin">Admin</option></Select></Field>
          <Button type="submit" disabled={submitting}><UserRoundCog size={18} /> {submitting ? 'Membuat...' : 'Buat Pengguna'}</Button>
        </form>
      </Modal>

      <Modal open={Boolean(passwordUser)} title={`Ganti Password ${passwordUser?.full_name ?? ''}`} onClose={() => setPasswordUser(null)}>
        <form className="form-stack" onSubmit={updatePassword}>
          <Field label="Password baru" hint="Minimal 10 karakter."><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required autoFocus /></Field>
          <Button type="submit" disabled={submitting}><ShieldCheck size={18} /> {submitting ? 'Menyimpan...' : 'Simpan Password'}</Button>
        </form>
      </Modal>
    </>
  );
}
