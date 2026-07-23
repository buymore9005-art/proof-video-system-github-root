import { BarcodeGate, DEFAULT_BARCODE_RULES, normalizeBarcode, validateBarcode } from '../src/lib/barcode';

describe('barcode', () => {
  it('normalizes whitespace and optional uppercase', () => {
    expect(normalizeBarcode(' ab 12 ', true)).toBe('AB12');
  });

  it('rejects values outside configured pattern', () => {
    expect(() => validateBarcode('ORDER#1', DEFAULT_BARCODE_RULES)).toThrow('Format barcode');
  });

  it('accepts only after required confirmations', () => {
    const gate = new BarcodeGate({ ...DEFAULT_BARCODE_RULES, confirmationCount: 2, cooldownMs: 5000 });
    expect(gate.push('ORDER001', 1000)).toBeNull();
    expect(gate.push('ORDER001', 1100)).toBe('ORDER001');
    expect(gate.push('ORDER001', 1200)).toBeNull();
  });
});
