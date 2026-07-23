import {
  Camera,
  CameraOff,
  CheckCircle2,
  CircleStop,
  Clock3,
  Keyboard,
  RotateCcw,
  ScanLine,
  Video,
  WifiOff,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { BarcodeGate } from '../lib/barcode';
import { errorMessage, formatDuration } from '../lib/format';
import { buildVideoPath } from '../lib/filename';
import {
  createMediaRecorder,
  listVideoDevices,
  requestCameraStream,
  stopStream,
} from '../lib/media';
import { createBarcodeScanner, type BarcodeScanner } from '../lib/scanner';
import {
  clearActiveRecordingSession,
  getActiveRecordingSession,
  setActiveRecordingSession,
} from '../lib/session-lock';
import { supabase } from '../lib/supabase';
import type { UploadJob } from '../lib/upload-db';
import type { PackingSession } from '../types/database';
import { useAuth } from '../providers/auth-provider';
import { useSettings } from '../providers/settings-provider';
import { useToast } from '../providers/toast-provider';
import { useUploads } from '../providers/upload-provider';
import { Badge, Button, Card, Field, Input, Select, Spinner } from './ui';

interface ActiveSegment {
  clientId: string;
  barcode: string;
  orderNumber: string;
  sequenceNo: number;
  startTime: string;
  recorder: MediaRecorder;
  mimeType: string;
  chunks: BlobPart[];
}

interface HistoryItem {
  clientId: string;
  barcode: string;
  sequenceNo: number;
  startTime: string;
  endTime: string | null;
  status: 'recording' | 'queued' | 'discarded';
}

export function RecordingStation() {
  const { user, profile } = useAuth();
  const { settings } = useSettings();
  const { enqueue } = useUploads();
  const { showToast } = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<BarcodeScanner | null>(null);
  const sessionRef = useRef<PackingSession | null>(null);
  const activeRef = useRef<ActiveSegment | null>(null);
  const sequenceRef = useRef(0);
  const transitionRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const intentionalCameraStopRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const cameraRequestIdRef = useRef(0);
  const startCameraRef = useRef<(preferredDeviceId?: string) => Promise<void>>(async () => undefined);
  const gateRef = useRef(new BarcodeGate(settings.barcode));

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'ready' | 'off' | 'error'>('off');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerMode, setScannerMode] = useState<'native' | 'zxing' | null>(null);
  const [session, setSession] = useState<PackingSession | null>(null);
  const [activeInfo, setActiveInfo] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [manualBarcode, setManualBarcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastDetection, setLastDetection] = useState<string | null>(null);

  useEffect(() => {
    gateRef.current.updateRules(settings.barcode);
  }, [settings.barcode]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const startSegment = useCallback(
    async (barcode: string) => {
      const currentSession = sessionRef.current;
      const stream = streamRef.current;
      if (!currentSession || !stream) return;

      sequenceRef.current += 1;
      const sequenceNo = sequenceRef.current;
      const clientId = crypto.randomUUID();
      const startTime = new Date().toISOString();
      const { recorder, mimeType } = createMediaRecorder(stream, settings.recording);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        showToast('MediaRecorder mengalami kesalahan.', 'error');
      };
      recorder.start(1000);

      const active: ActiveSegment = {
        clientId,
        barcode,
        orderNumber: barcode,
        sequenceNo,
        startTime,
        recorder,
        mimeType,
        chunks,
      };
      activeRef.current = active;
      const info: HistoryItem = {
        clientId,
        barcode,
        sequenceNo,
        startTime,
        endTime: null,
        status: 'recording',
      };
      setActiveInfo(info);
      setHistory((items) => [info, ...items.filter((item) => item.clientId !== clientId)]);
      setLastDetection(barcode);
      void supabase.rpc('log_activity', {
        p_action: 'barcode_detected',
        p_entity_type: 'packing_session',
        p_entity_id: currentSession.id,
        p_details: { barcode, sequence_no: sequenceNo },
      });
    },
    [settings.recording, showToast],
  );

  const finalizeActive = useCallback(
    async (discard = false) => {
      const active = activeRef.current;
      const currentSession = sessionRef.current;
      if (!active || !currentSession || !user) return;
      activeRef.current = null;
      setActiveInfo(null);

      const blob = await new Promise<Blob>((resolve, reject) => {
        const finish = () => resolve(new Blob(active.chunks, { type: active.mimeType }));
        if (active.recorder.state === 'inactive') {
          finish();
          return;
        }
        active.recorder.onstop = finish;
        active.recorder.onerror = () => reject(new Error('Perekaman segmen gagal dihentikan.'));
        try {
          active.recorder.requestData();
        } catch {
          // Beberapa browser tidak mengizinkan requestData tepat sebelum stop.
        }
        active.recorder.stop();
      });

      const endTime = new Date().toISOString();
      setHistory((items) =>
        items.map((item) =>
          item.clientId === active.clientId
            ? { ...item, endTime, status: discard ? 'discarded' : 'queued' }
            : item,
        ),
      );

      if (discard) {
        sequenceRef.current = Math.max(0, sequenceRef.current - 1);
        void supabase.rpc('log_activity', {
          p_action: 'barcode_cancelled',
          p_entity_type: 'packing_session',
          p_entity_id: currentSession.id,
          p_details: { barcode: active.barcode, sequence_no: active.sequenceNo },
        });
        return;
      }

      if (blob.size === 0) {
        throw new Error(`Video ${active.orderNumber} kosong dan tidak dimasukkan ke antrean.`);
      }

      const { filename, path } = buildVideoPath({
        operatorId: user.id,
        sessionId: currentSession.id,
        orderNumber: active.orderNumber,
        sequenceNo: active.sequenceNo,
        startedAt: active.startTime,
        mimeType: active.mimeType,
      });
      const durationMs = Math.max(0, new Date(endTime).getTime() - new Date(active.startTime).getTime());
      const now = new Date().toISOString();
      const job: UploadJob = {
        id: active.clientId,
        userId: user.id,
        sessionId: currentSession.id,
        orderNumber: active.orderNumber,
        barcode: active.barcode,
        sequenceNo: active.sequenceNo,
        startTime: active.startTime,
        endTime,
        durationMs,
        filename,
        mimeType: active.mimeType,
        filesize: blob.size,
        storagePath: path,
        blob,
        status: 'queued',
        progress: 0,
        retryCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };
      await enqueue(job);
    },
    [enqueue, user],
  );

  const switchBarcode = useCallback(
    async (barcode: string) => {
      if (!sessionRef.current || !streamRef.current) return;
      if (activeRef.current?.barcode === barcode) return;
      await finalizeActive(false);
      await startSegment(barcode);
    },
    [finalizeActive, startSegment],
  );

  const queueBarcode = useCallback(
    (barcode: string) => {
      transitionRef.current = transitionRef.current
        .then(() => switchBarcode(barcode))
        .catch((error) => showToast(errorMessage(error), 'error'));
    },
    [showToast, switchBarcode],
  );

  const handleRawDetection = useCallback(
    (raw: string) => {
      if (!sessionRef.current) return;
      try {
        const accepted = gateRef.current.push(raw);
        if (accepted) queueBarcode(accepted);
      } catch {
        // Nilai yang tidak sesuai pola diabaikan agar kamera tidak menghasilkan notifikasi berulang.
      }
    },
    [queueBarcode],
  );

  const stopCamera = useCallback(() => {
    intentionalCameraStopRef.current = true;
    cameraRequestIdRef.current += 1;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    scannerRef.current?.stop();
    scannerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus('off');
    setScannerMode(null);
    window.setTimeout(() => {
      intentionalCameraStopRef.current = false;
    }, 0);
  }, []);

  const interruptSession = useCallback(
    async (reason: string) => {
      const current = sessionRef.current;
      if (!current) return;

      try {
        await transitionRef.current;
        await finalizeActive(false);
      } catch (error) {
        console.error('Segmen aktif tidak dapat diselamatkan saat interupsi:', error);
      }

      try {
        const { error } = await supabase.rpc('finish_packing_session', {
          p_session_id: current.id,
          p_status: 'interrupted',
        });
        if (error) throw error;
      } catch (error) {
        console.error('Status sesi interrupted akan dipulihkan oleh database:', error);
      } finally {
        clearActiveRecordingSession(window.sessionStorage);
        sessionRef.current = null;
        setSession(null);
        showToast(reason, 'error');
      }
    },
    [finalizeActive, showToast],
  );

  const startCamera = useCallback(
    async (preferredDeviceId = deviceId) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setCameraError('Browser tidak mendukung akses kamera.');
        return;
      }

      const requestId = ++cameraRequestIdRef.current;
      setCameraStatus('starting');
      setCameraError(null);
      scannerRef.current?.stop();
      scannerRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;

      try {
        const stream = await requestCameraStream(settings.recording, preferredDeviceId || undefined);
        if (!mountedRef.current || requestId !== cameraRequestIdRef.current) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        track?.addEventListener('ended', () => {
          if (
            intentionalCameraStopRef.current ||
            !mountedRef.current ||
            requestId !== cameraRequestIdRef.current ||
            streamRef.current !== stream
          ) {
            return;
          }
          scannerRef.current?.stop();
          scannerRef.current = null;
          streamRef.current = null;
          if (videoRef.current) videoRef.current.srcObject = null;
          setCameraStatus('error');
          setCameraError('Kamera terputus. Sistem mencoba menghubungkan kembali.');
          void interruptSession('Kamera terputus. Sesi ditandai sebagai interrupted.').finally(() => {
            reconnectTimerRef.current = window.setTimeout(() => {
              reconnectTimerRef.current = null;
              if (mountedRef.current) void startCameraRef.current(preferredDeviceId || undefined);
            }, 3000);
          });
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanner = createBarcodeScanner();
        scannerRef.current = scanner;
        setScannerMode(scanner.mode);
        if (videoRef.current) {
          await scanner.start(videoRef.current, handleRawDetection, (error) => {
            setCameraError(error.message);
          });
        }
        const nextDevices = await listVideoDevices();
        setDevices(nextDevices);
        const currentDeviceId = track?.getSettings().deviceId;
        if (currentDeviceId) setDeviceId(currentDeviceId);
        setCameraStatus('ready');
      } catch (error) {
        setCameraStatus('error');
        setCameraError(errorMessage(error));
      }
    },
    [deviceId, handleRawDetection, interruptSession, settings.recording],
  );

  useEffect(() => {
    startCameraRef.current = startCamera;
  }, [startCamera]);

  useEffect(() => {
    mountedRef.current = true;
    intentionalCameraStopRef.current = false;

    const previousSessionId = getActiveRecordingSession(window.sessionStorage);
    if (previousSessionId) {
      clearActiveRecordingSession(window.sessionStorage);
      void supabase
        .rpc('finish_packing_session', {
          p_session_id: previousSessionId,
          p_status: 'interrupted',
        })
        .then((result: { error: unknown | null }) => {
          if (!result.error) {
            showToast(
              'Sesi sebelumnya dipulihkan sebagai interrupted karena halaman dimuat ulang sebelum sesi diakhiri.',
              'info',
            );
          }
        });
    }

    void startCamera();
    return () => {
      mountedRef.current = false;
      intentionalCameraStopRef.current = true;
      cameraRequestIdRef.current += 1;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      scannerRef.current?.stop();
      stopStream(streamRef.current);
    };
    // Kamera hanya dibuka otomatis saat komponen pertama kali dipasang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) {
      setElapsedMs(0);
      return;
    }
    const update = () => setElapsedMs(Date.now() - new Date(session.started_at).getTime());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const heartbeat = () => {
      void supabase.rpc('heartbeat_packing_session', { p_session_id: session.id });
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, Math.max(10, settings.sessionHeartbeatSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [session, settings.sessionHeartbeatSeconds]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!sessionRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const startSession = async () => {
    if (!profile || !user) return;
    setBusy(true);
    try {
      if (!streamRef.current || cameraStatus !== 'ready') await startCamera();
      if (!streamRef.current) throw new Error('Kamera belum siap.');
      const cameraLabel = streamRef.current.getVideoTracks()[0]?.label ?? null;
      const { data, error } = await supabase.rpc('start_packing_session', {
        p_camera_label: cameraLabel,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      const created = data?.[0];
      if (!created) throw new Error('Database tidak mengembalikan sesi baru.');
      sequenceRef.current = created.segment_count ?? 0;
      setHistory([]);
      setLastDetection(null);
      setSession(created);
      sessionRef.current = created;
      setActiveRecordingSession(window.sessionStorage, created.id);
      gateRef.current.resetCandidate();
      showToast('Sesi perekaman dimulai.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    const current = sessionRef.current;
    if (!current) return;
    setBusy(true);
    try {
      await transitionRef.current;
      await finalizeActive(false);
      const { error } = await supabase.rpc('finish_packing_session', {
        p_session_id: current.id,
        p_status: 'completed',
      });
      if (error) throw error;
      clearActiveRecordingSession(window.sessionStorage);
      setSession(null);
      sessionRef.current = null;
      showToast('Sesi diakhiri. Antrean upload tetap berjalan.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelLastBarcode = async () => {
    if (!activeRef.current) {
      showToast('Tidak ada barcode aktif yang dapat dibatalkan.', 'info');
      return;
    }
    setBusy(true);
    try {
      await transitionRef.current;
      await finalizeActive(true);
      showToast('Barcode aktif dibatalkan dan videonya tidak disimpan.', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitManualBarcode = (event: FormEvent) => {
    event.preventDefault();
    if (!manualBarcode.trim()) return;
    try {
      const accepted = gateRef.current.push(manualBarcode, Date.now() - settings.barcode.confirmationWindowMs);
      const finalValue = accepted ?? gateRef.current.push(manualBarcode, Date.now());
      if (finalValue) queueBarcode(finalValue);
      setManualBarcode('');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  };

  const statusTone = cameraStatus === 'ready' ? 'success' : cameraStatus === 'error' ? 'danger' : 'warning';
  const historyRows = useMemo(() => history.slice(0, 20), [history]);

  return (
    <div className="recording-layout">
      <div className="recording-main">
        <Card
          title="Kamera Packing"
          action={
            <div className="inline-actions">
              <Badge tone={statusTone}>
                {cameraStatus === 'ready'
                  ? 'Kamera siap'
                  : cameraStatus === 'starting'
                    ? 'Mengaktifkan kamera'
                    : cameraStatus === 'error'
                      ? 'Kamera bermasalah'
                      : 'Kamera mati'}
              </Badge>
              {scannerMode ? <Badge tone="info">Scanner: {scannerMode}</Badge> : null}
            </div>
          }
        >
          <div className="camera-stage">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="scan-frame" aria-hidden="true">
              <span />
            </div>
            {cameraStatus !== 'ready' ? (
              <div className="camera-placeholder">
                {cameraStatus === 'starting' ? <Spinner label="Mengaktifkan kamera" /> : <CameraOff size={48} />}
                {cameraError ? <p>{cameraError}</p> : null}
              </div>
            ) : null}
            {session ? (
              <div className="recording-indicator">
                <span className="record-dot" /> REC {formatDuration(elapsedMs)}
              </div>
            ) : null}
          </div>

          <div className="camera-controls">
            <Field label="Perangkat kamera">
              <Select
                value={deviceId}
                disabled={Boolean(session) || cameraStatus === 'starting'}
                onChange={(event) => {
                  const next = event.target.value;
                  setDeviceId(next);
                  void startCamera(next);
                }}
              >
                <option value="">Kamera otomatis</option>
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Kamera ${index + 1}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="inline-actions control-buttons">
              {cameraStatus !== 'ready' ? (
                <Button type="button" variant="secondary" onClick={() => void startCamera()} disabled={busy}>
                  <Camera size={18} /> Aktifkan Kamera
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={stopCamera} disabled={Boolean(session)}>
                  <CameraOff size={18} /> Matikan Kamera
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Kontrol Sesi">
          <div className="session-controls">
            {!session ? (
              <Button type="button" onClick={() => void startSession()} disabled={busy || cameraStatus !== 'ready'}>
                <Video size={18} /> Mulai Sesi
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={() => void endSession()} disabled={busy}>
                <CircleStop size={18} /> Akhiri Sesi
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void cancelLastBarcode()}
              disabled={!session || !activeInfo || busy}
            >
              <RotateCcw size={18} /> Batalkan Barcode Terakhir
            </Button>
          </div>
          <form className="manual-barcode" onSubmit={submitManualBarcode}>
            <Keyboard size={18} />
            <Input
              value={manualBarcode}
              onChange={(event) => setManualBarcode(event.target.value)}
              placeholder="Masukkan barcode manual untuk pengujian"
              disabled={!session}
            />
            <Button type="submit" variant="secondary" disabled={!session || !manualBarcode.trim()}>
              Proses
            </Button>
          </form>
        </Card>

        <Card title="Riwayat Barcode Sesi">
          {historyRows.length === 0 ? (
            <div className="empty-recording-history">
              <ScanLine size={34} />
              <p>Belum ada barcode. Tampilkan barcode ke kamera setelah sesi dimulai.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Barcode</th>
                    <th>Mulai</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((item) => (
                    <tr key={item.clientId}>
                      <td>{item.sequenceNo}</td>
                      <td><strong>{item.barcode}</strong></td>
                      <td>{new Date(item.startTime).toLocaleTimeString('id-ID')}</td>
                      <td>
                        <Badge tone={item.status === 'recording' ? 'danger' : item.status === 'queued' ? 'warning' : 'neutral'}>
                          {item.status === 'recording' ? 'Merekam' : item.status === 'queued' ? 'Antrean upload' : 'Dibatalkan'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <aside className="recording-side">
        <Card title="Pesanan Aktif">
          {activeInfo ? (
            <div className="active-order-card">
              <span>Nomor pesanan / barcode</span>
              <strong>{activeInfo.barcode}</strong>
              <Badge tone="danger"><span className="record-dot" /> Sedang direkam</Badge>
            </div>
          ) : (
            <div className="active-order-card muted">
              <ScanLine size={38} />
              <span>{session ? 'Menunggu barcode berikutnya' : 'Mulai sesi terlebih dahulu'}</span>
            </div>
          )}
        </Card>

        <Card title="Status Sesi">
          <dl className="detail-list">
            <div><dt>Status</dt><dd>{session ? <Badge tone="success">Aktif</Badge> : <Badge>Belum aktif</Badge>}</dd></div>
            <div><dt>Durasi</dt><dd><Clock3 size={16} /> {formatDuration(elapsedMs)}</dd></div>
            <div><dt>Petugas</dt><dd>{profile?.full_name ?? '-'}</dd></div>
            <div><dt>Jumlah barcode</dt><dd>{history.filter((item) => item.status !== 'discarded').length}</dd></div>
            <div><dt>Deteksi terakhir</dt><dd>{lastDetection ?? '-'}</dd></div>
          </dl>
        </Card>

        <Card title="Panduan Singkat">
          <ol className="steps-list">
            <li>Pastikan kamera menampilkan area packing dengan jelas.</li>
            <li>Klik <strong>Mulai Sesi</strong>.</li>
            <li>Tampilkan barcode pesanan sebelum mulai packing.</li>
            <li>Barcode berikutnya menutup video sebelumnya dan memulai video baru.</li>
            <li>Klik <strong>Akhiri Sesi</strong> setelah semua pesanan selesai.</li>
          </ol>
          {!navigator.onLine ? (
            <p className="warning-box"><WifiOff size={18} /> Internet terputus. Video tetap tersimpan lokal dan akan dilanjutkan saat online.</p>
          ) : (
            <p className="success-box"><CheckCircle2 size={18} /> Internet terhubung. Antrean upload berjalan otomatis.</p>
          )}
        </Card>
      </aside>
    </div>
  );
}
