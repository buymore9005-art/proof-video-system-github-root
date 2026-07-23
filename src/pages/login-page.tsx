import { Camera, LockKeyhole, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { errorMessage } from '../lib/format';
import { useAuth } from '../providers/auth-provider';
import { useToast } from '../providers/toast-provider';
import { Button, Card, Field, Input, Spinner } from '../components/ui';

export function LoginPage() {
  const { user, profile, loading, signIn } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    apiRequest<{ setupRequired: boolean }>('/api/setup')
      .then((result) => {
        if (result.setupRequired) navigate('/setup', { replace: true });
      })
      .catch(() => {
        // Login tetap tersedia ketika pemeriksaan setup gagal.
      })
      .finally(() => setCheckingSetup(false));
  }, [navigate]);

  if (!loading && user && profile) {
    const destination =
      (location.state as { from?: string } | null)?.from ??
      (profile.role === 'admin' ? '/dashboard' : '/recording');
    return <Navigate to={destination} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      showToast('Login berhasil.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-logo"><Camera size={30} /></div>
        <h1>Proof Video System</h1>
        <p>Rekam, identifikasi, simpan, dan temukan bukti video packing secara otomatis.</p>
        <div className="auth-feature-list">
          <span>Deteksi barcode otomatis</span>
          <span>Upload resumable ke Supabase</span>
          <span>Kontrol akses Admin dan Petugas</span>
        </div>
      </section>
      <Card className="auth-card">
        <div className="auth-card-heading">
          <h2>Masuk ke aplikasi</h2>
          <p>Gunakan akun yang dibuat oleh Admin.</p>
        </div>
        {checkingSetup || loading ? (
          <Spinner label="Memeriksa aplikasi" />
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <Field label="Email">
              <div className="input-with-icon"><Mail size={18} /><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div>
            </Field>
            <Field label="Password">
              <div className="input-with-icon"><LockKeyhole size={18} /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required /></div>
            </Field>
            <Button type="submit" disabled={submitting}>{submitting ? 'Memproses...' : 'Masuk'}</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
