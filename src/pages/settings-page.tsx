import { Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from '../components/ui';
import { errorMessage } from '../lib/format';
import { useSettings, type SystemSettings } from '../providers/settings-provider';
import { useToast } from '../providers/toast-provider';

export function SettingsPage() {
  const { settings, loading, save } = useSettings();
  const { showToast } = useToast();
  const [form, setForm] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await save(form);
      showToast('Pengaturan berhasil disimpan.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner label="Memuat pengaturan" />;

  return (
    <form onSubmit={submit}>
      <PageHeader title="Pengaturan" description="Atur validasi barcode, kualitas rekaman, dan perilaku upload." actions={<Button type="submit" disabled={saving}><Save size={17} /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>} />
      <div className="settings-grid">
        <Card title="Validasi Barcode">
          <div className="form-grid-two">
            <Field label="Panjang minimum"><Input type="number" min={1} max={160} value={form.barcode.minLength} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, minLength: Number(event.target.value) } }))} /></Field>
            <Field label="Panjang maksimum"><Input type="number" min={1} max={160} value={form.barcode.maxLength} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, maxLength: Number(event.target.value) } }))} /></Field>
            <Field label="Jumlah konfirmasi" hint="Jumlah pembacaan sama sebelum barcode diterima."><Input type="number" min={1} max={10} value={form.barcode.confirmationCount} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, confirmationCount: Number(event.target.value) } }))} /></Field>
            <Field label="Jendela konfirmasi (ms)"><Input type="number" min={200} max={10000} step={100} value={form.barcode.confirmationWindowMs} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, confirmationWindowMs: Number(event.target.value) } }))} /></Field>
            <Field label="Cooldown barcode sama (ms)"><Input type="number" min={500} max={60000} step={500} value={form.barcode.cooldownMs} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, cooldownMs: Number(event.target.value) } }))} /></Field>
            <Field label="Ubah menjadi huruf besar"><Select value={String(form.barcode.uppercase)} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, uppercase: event.target.value === 'true' } }))}><option value="false">Tidak</option><option value="true">Ya</option></Select></Field>
          </div>
          <Field label="Pola RegExp" hint="Default menerima huruf, angka, titik, garis bawah, titik dua, slash, dan strip."><Input value={form.barcode.pattern} onChange={(event) => setForm((value) => ({ ...value, barcode: { ...value.barcode, pattern: event.target.value } }))} /></Field>
        </Card>

        <Card title="Kualitas Rekaman">
          <div className="form-grid-two">
            <Field label="Lebar video"><Input type="number" min={320} max={3840} step={16} value={form.recording.width} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, width: Number(event.target.value) } }))} /></Field>
            <Field label="Tinggi video"><Input type="number" min={240} max={2160} step={16} value={form.recording.height} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, height: Number(event.target.value) } }))} /></Field>
            <Field label="Frame rate"><Input type="number" min={10} max={60} value={form.recording.frameRate} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, frameRate: Number(event.target.value) } }))} /></Field>
            <Field label="Video bitrate (bps)"><Input type="number" min={250000} max={20000000} step={250000} value={form.recording.videoBitsPerSecond} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, videoBitsPerSecond: Number(event.target.value) } }))} /></Field>
            <Field label="Audio bitrate (bps)"><Input type="number" min={16000} max={320000} step={8000} value={form.recording.audioBitsPerSecond} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, audioBitsPerSecond: Number(event.target.value) } }))} /></Field>
            <Field label="Rekam audio"><Select value={String(form.recording.includeAudio)} onChange={(event) => setForm((value) => ({ ...value, recording: { ...value.recording, includeAudio: event.target.value === 'true' } }))}><option value="true">Ya</option><option value="false">Tidak</option></Select></Field>
          </div>
        </Card>

        <Card title="Upload dan Sesi">
          <div className="form-grid-two">
            <Field label="Maksimum percobaan upload"><Input type="number" min={1} max={20} value={form.uploadMaxRetries} onChange={(event) => setForm((value) => ({ ...value, uploadMaxRetries: Number(event.target.value) }))} /></Field>
            <Field label="Heartbeat sesi (detik)"><Input type="number" min={10} max={300} value={form.sessionHeartbeatSeconds} onChange={(event) => setForm((value) => ({ ...value, sessionHeartbeatSeconds: Number(event.target.value) }))} /></Field>
          </div>
          <p className="info-box"><SlidersHorizontal size={18} /> Perubahan kualitas rekaman berlaku saat kamera atau sesi berikutnya dimulai.</p>
        </Card>
      </div>
    </form>
  );
}
