export interface RecordingSettings {
  width: number;
  height: number;
  frameRate: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  includeAudio: boolean;
}

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  width: 1280,
  height: 720,
  frameRate: 24,
  videoBitsPerSecond: 1_200_000,
  audioBitsPerSecond: 64_000,
  includeAudio: true,
};

const MIME_CANDIDATES = [
  'video/mp4;codecs=h264,aac',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function getPreferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Browser tidak mendukung MediaRecorder.');
  }
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export async function requestCameraStream(
  settings: RecordingSettings,
  deviceId?: string,
): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: settings.width },
    height: { ideal: settings.height },
    frameRate: { ideal: settings.frameRate, max: settings.frameRate },
    facingMode: deviceId ? undefined : { ideal: 'environment' },
    deviceId: deviceId ? { exact: deviceId } : undefined,
  };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video,
      audio: settings.includeAudio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
          }
        : false,
    });
  } catch (error) {
    if (!settings.includeAudio) throw error;
    return navigator.mediaDevices.getUserMedia({ video, audio: false });
  }
}

export function createMediaRecorder(
  stream: MediaStream,
  settings: RecordingSettings,
): { recorder: MediaRecorder; mimeType: string } {
  const mimeType = getPreferredMimeType();
  const options: MediaRecorderOptions = {
    videoBitsPerSecond: settings.videoBitsPerSecond,
    audioBitsPerSecond: settings.audioBitsPerSecond,
  };
  if (mimeType) options.mimeType = mimeType;
  const recorder = new MediaRecorder(stream, options);
  return { recorder, mimeType: recorder.mimeType || mimeType || 'video/webm' };
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}
