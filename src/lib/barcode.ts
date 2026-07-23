export interface BarcodeRules {
  minLength: number;
  maxLength: number;
  pattern: string;
  uppercase: boolean;
  confirmationCount: number;
  confirmationWindowMs: number;
  cooldownMs: number;
}

export const DEFAULT_BARCODE_RULES: BarcodeRules = {
  minLength: 3,
  maxLength: 160,
  pattern: '^[A-Za-z0-9._:/-]+$',
  uppercase: false,
  confirmationCount: 2,
  confirmationWindowMs: 1500,
  cooldownMs: 5000,
};

export function normalizeBarcode(raw: string, uppercase = false): string {
  const normalized = raw.trim().replace(/\s+/g, '');
  return uppercase ? normalized.toUpperCase() : normalized;
}

export function validateBarcode(raw: string, rules: BarcodeRules): string {
  const value = normalizeBarcode(raw, rules.uppercase);
  if (value.length < rules.minLength) {
    throw new Error(`Barcode minimal ${rules.minLength} karakter.`);
  }
  if (value.length > rules.maxLength) {
    throw new Error(`Barcode maksimal ${rules.maxLength} karakter.`);
  }

  let expression: RegExp;
  try {
    expression = new RegExp(rules.pattern);
  } catch {
    throw new Error('Pola validasi barcode pada Pengaturan tidak valid.');
  }

  if (!expression.test(value)) {
    throw new Error('Format barcode tidak sesuai aturan sistem.');
  }
  return value;
}

interface Candidate {
  value: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export class BarcodeGate {
  private candidate: Candidate | null = null;
  private lastAccepted = new Map<string, number>();

  constructor(private rules: BarcodeRules) {}

  updateRules(rules: BarcodeRules): void {
    this.rules = rules;
    this.resetCandidate();
  }

  resetCandidate(): void {
    this.candidate = null;
  }

  push(rawValue: string, now = Date.now()): string | null {
    const value = validateBarcode(rawValue, this.rules);
    const lastAcceptedAt = this.lastAccepted.get(value);
    if (lastAcceptedAt && now - lastAcceptedAt < this.rules.cooldownMs) {
      return null;
    }

    if (
      !this.candidate ||
      this.candidate.value !== value ||
      now - this.candidate.firstSeenAt > this.rules.confirmationWindowMs
    ) {
      this.candidate = { value, count: 1, firstSeenAt: now, lastSeenAt: now };
    } else {
      this.candidate.count += 1;
      this.candidate.lastSeenAt = now;
    }

    if (this.candidate.count < Math.max(1, this.rules.confirmationCount)) {
      return null;
    }

    this.lastAccepted.set(value, now);
    this.candidate = null;
    this.prune(now);
    return value;
  }

  private prune(now: number): void {
    const threshold = Math.max(this.rules.cooldownMs * 4, 60_000);
    for (const [value, acceptedAt] of this.lastAccepted.entries()) {
      if (now - acceptedAt > threshold) this.lastAccepted.delete(value);
    }
  }
}
