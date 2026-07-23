import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

export function NotFoundPage() {
  return (
    <main className="center-screen">
      <Card className="not-found-card">
        <h1>404</h1>
        <p>Halaman tidak ditemukan.</p>
        <Link className="button button-primary button-md" to="/">Kembali ke aplikasi</Link>
      </Card>
    </main>
  );
}
