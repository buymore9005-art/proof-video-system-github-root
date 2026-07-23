import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_BARCODE_RULES, type BarcodeRules } from '../lib/barcode';
import { DEFAULT_RECORDING_SETTINGS, type RecordingSettings } from '../lib/media';
import { supabase } from '../lib/supabase';
import type { AppSetting, Json } from '../types/database';
import { useAuth } from './auth-provider';

export interface SystemSettings {
  barcode: BarcodeRules;
  recording: RecordingSettings;
  uploadMaxRetries: number;
  sessionHeartbeatSeconds: number;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  barcode: DEFAULT_BARCODE_RULES,
  recording: DEFAULT_RECORDING_SETTINGS,
  uploadMaxRetries: 5,
  sessionHeartbeatSeconds: 20,
};

interface SettingsContextValue {
  settings: SystemSettings;
  rows: AppSetting[];
  loading: boolean;
  reload: () => Promise<void>;
  save: (settings: SystemSettings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const numberValue = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const booleanValue = (value: Json | undefined, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;
const stringValue = (value: Json | undefined, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

function rowsToSettings(rows: AppSetting[]): SystemSettings {
  const map = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
  return {
    barcode: {
      minLength: numberValue(map.get('barcode_min_length'), DEFAULT_BARCODE_RULES.minLength),
      maxLength: numberValue(map.get('barcode_max_length'), DEFAULT_BARCODE_RULES.maxLength),
      pattern: stringValue(map.get('barcode_pattern'), DEFAULT_BARCODE_RULES.pattern),
      uppercase: booleanValue(map.get('barcode_uppercase'), DEFAULT_BARCODE_RULES.uppercase),
      confirmationCount: numberValue(
        map.get('barcode_confirmation_count'),
        DEFAULT_BARCODE_RULES.confirmationCount,
      ),
      confirmationWindowMs: numberValue(
        map.get('barcode_confirmation_window_ms'),
        DEFAULT_BARCODE_RULES.confirmationWindowMs,
      ),
      cooldownMs: numberValue(map.get('barcode_cooldown_ms'), DEFAULT_BARCODE_RULES.cooldownMs),
    },
    recording: {
      width: numberValue(map.get('recording_width'), DEFAULT_RECORDING_SETTINGS.width),
      height: numberValue(map.get('recording_height'), DEFAULT_RECORDING_SETTINGS.height),
      frameRate: numberValue(map.get('recording_frame_rate'), DEFAULT_RECORDING_SETTINGS.frameRate),
      videoBitsPerSecond: numberValue(
        map.get('recording_video_bitrate'),
        DEFAULT_RECORDING_SETTINGS.videoBitsPerSecond,
      ),
      audioBitsPerSecond: numberValue(
        map.get('recording_audio_bitrate'),
        DEFAULT_RECORDING_SETTINGS.audioBitsPerSecond,
      ),
      includeAudio: booleanValue(
        map.get('recording_include_audio'),
        DEFAULT_RECORDING_SETTINGS.includeAudio,
      ),
    },
    uploadMaxRetries: numberValue(map.get('upload_max_retries'), 5),
    sessionHeartbeatSeconds: numberValue(map.get('session_heartbeat_seconds'), 20),
  };
}

function settingsToJson(settings: SystemSettings): Json {
  return {
    barcode_min_length: settings.barcode.minLength,
    barcode_max_length: settings.barcode.maxLength,
    barcode_pattern: settings.barcode.pattern,
    barcode_uppercase: settings.barcode.uppercase,
    barcode_confirmation_count: settings.barcode.confirmationCount,
    barcode_confirmation_window_ms: settings.barcode.confirmationWindowMs,
    barcode_cooldown_ms: settings.barcode.cooldownMs,
    recording_width: settings.recording.width,
    recording_height: settings.recording.height,
    recording_frame_rate: settings.recording.frameRate,
    recording_video_bitrate: settings.recording.videoBitsPerSecond,
    recording_audio_bitrate: settings.recording.audioBitsPerSecond,
    recording_include_audio: settings.recording.includeAudio,
    upload_max_retries: settings.uploadMaxRetries,
    session_heartbeat_seconds: settings.sessionHeartbeatSeconds,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SYSTEM_SETTINGS);
  const [rows, setRows] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SYSTEM_SETTINGS);
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('app_settings').select('*').order('setting_key');
      if (error) throw error;
      const nextRows = data ?? [];
      setRows(nextRows);
      setSettings(rowsToSettings(nextRows));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (nextSettings: SystemSettings) => {
    const { error } = await supabase.rpc('save_app_settings', {
      p_settings: settingsToJson(nextSettings),
    });
    if (error) throw error;
    await reload();
  }, [reload]);

  const value = useMemo(
    () => ({ settings, rows, loading, reload, save }),
    [settings, rows, loading, reload, save],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings harus digunakan di dalam SettingsProvider.');
  return context;
}
