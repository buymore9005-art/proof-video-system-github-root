import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

export type ScanCallback = (value: string) => void;
export type ScanErrorCallback = (error: Error) => void;

export interface BarcodeScanner {
  start(video: HTMLVideoElement, onScan: ScanCallback, onError?: ScanErrorCallback): Promise<void>;
  stop(): void;
  readonly mode: 'native' | 'zxing';
}

class NativeBarcodeScanner implements BarcodeScanner {
  readonly mode = 'native' as const;
  private stopped = true;
  private frameHandle: number | null = null;
  private detector = new BarcodeDetector({
    formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'qr_code', 'upc_a', 'upc_e'],
  });

  async start(video: HTMLVideoElement, onScan: ScanCallback, onError?: ScanErrorCallback): Promise<void> {
    this.stop();
    this.stopped = false;

    const loop = async () => {
      if (this.stopped) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const results = await this.detector.detect(video);
          for (const result of results) {
            if (result.rawValue) onScan(result.rawValue);
          }
        }
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Gagal membaca barcode.'));
      } finally {
        if (!this.stopped) this.frameHandle = window.setTimeout(loop, 200);
      }
    };

    await loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.frameHandle !== null) {
      window.clearTimeout(this.frameHandle);
      this.frameHandle = null;
    }
  }
}

class ZxingBarcodeScanner implements BarcodeScanner {
  readonly mode = 'zxing' as const;
  private reader = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;

  async start(video: HTMLVideoElement, onScan: ScanCallback, onError?: ScanErrorCallback): Promise<void> {
    this.stop();
    try {
      this.controls = await this.reader.decodeFromVideoElement(video, (result, error) => {
        if (result) onScan(result.getText());
        if (error && error.name !== 'NotFoundException') {
          onError?.(error instanceof Error ? error : new Error('Gagal membaca barcode.'));
        }
      });
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('ZXing tidak dapat dimulai.'));
    }
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
  }
}

export function createBarcodeScanner(): BarcodeScanner {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      return new NativeBarcodeScanner();
    } catch {
      // Beberapa browser mengekspos API tetapi tidak mendukung format yang diminta.
    }
  }
  return new ZxingBarcodeScanner();
}
