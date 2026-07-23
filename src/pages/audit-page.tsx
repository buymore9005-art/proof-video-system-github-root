import { RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/date';
import { errorMessage } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../providers/toast-provider';
import type { ActivityLog } from '../types/database';

export function AuditPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(300);
      const clean = search.replace(/[,%()]/g, ' ').trim().slice(0, 100);
      if (clean) query = query.or(`actor_name.ilike.%${clean}%,action.ilike.%${clean}%,entity_type.ilike.%${clean}%`);
      const { data, error } = await query;
      if (error) throw error;
      setLogs(data ?? []);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="Audit Log" description="Riwayat aktivitas penting pengguna dan sistem." actions={<Button type="button" variant="secondary" onClick={() => void load()}><RefreshCw size={17} /> Muat ulang</Button>} />
      <Card title="Pencarian"><Field label="Cari log"><div className="input-with-icon"><Search size={17} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, aksi, atau jenis data" /></div></Field></Card>
      <Card title="Aktivitas Terbaru">
        {loading ? <Spinner label="Memuat audit log" /> : logs.length === 0 ? <EmptyState title="Log tidak ditemukan" description="Aktivitas sistem akan tampil di sini." /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr></thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.actor_name}</td>
                    <td><Badge tone="info">{log.action}</Badge></td>
                    <td>{log.entity_type}{log.entity_id ? <small>{log.entity_id}</small> : null}</td>
                    <td><code className="json-preview">{JSON.stringify(log.details)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
