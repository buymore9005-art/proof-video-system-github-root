import { Camera, KeyRound, Mail, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { errorMessage } from '../lib/format';
import { useAuth } from '../providers/auth-provider';
import { useToast } from '../providers/toast-provider';
import { Button, Card, Field, Input, Spinner } from '../components/ui';

export function SetupPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<{ setupRequired: boolean }>('/api/setup')
      .then((result) => setRequired(result.setupRequired))
      .catch((error) => showToast(errorMessage(error), 'error'))
      .finally(() => setChecking(false));
  }, [showToast]);

  if (user && profile) return <Navigate to={profile.role === 'admin' ? '/dashboard' : '/recording'} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest<{ userId: string }>('/api/setup', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, setupSecret }),
      });
      showToast('Admin pertama berhasil dibuat. Silakan login.', 'success');
      navigate('/login', { replace: true });
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page auth-page-single">
      <Card className="auth-card setup-card">
        <div className="auth-logo"><Camera size={28} /></div>
        <div className="auth-card-heading">
          <h1>Setup Proof Video System</h1>
          <p>Buat satu akun Admin pertama. Halaman ini otomatis terkunci setelah setup berhasil.</p>
        </div>
        {checking ? (
          <Spinner label="Memeriksa status setup" />
        ) : !required ? (
          <div className="setup-complete">
            <strong>Setup sudah selesai.</strong>
            <p>Admin pertama sudah tersedia.</p>
            <Button type="button" onClick={() => navigate('/login')}>Ke halaman login</Button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <Field label="Nama lengkap Admin">
              <div className="input-with-icon"><UserRound size={18} /><Input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={120} required /></div>
            </Field>
            <Field label="Email Admin">
              <div className="input-with-icon"><Mail size={18} /><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            </Field>
            <Field label="Password" hint="Minimal 10 karakter, gunakan kombinasi huruf dan angka.">
              <div className="input-with-icon"><KeyRound size={18} /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></div>
            </Field>
            <Field label="SETUP_SECRET" hint="Nilai yang sama dengan environment variable SETUP_SECRET di Vercel.">
              <Input type="password" value={setupSecret} onChange={(event) => setSetupSecret(event.target.value)} minLength={16} required />
            </Field>
            <Button type="submit" disabled={submitting}>{submitting ? 'Membuat Admin...' : 'Buat Admin Pertama'}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
