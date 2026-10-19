import { describe, expect, it } from 'vitest';
import { formatINR, paiseToRupees, rupeesToPaise } from '../src/money.js';

describe('money utilities', () => {
  it('converts rupees to paise and vice versa', () => {
    expect(rupeesToPaise(100)).toBe(10000);
    expect(rupeesToPaise(132300)).toBe(13230000);
    expect(paiseToRupees(10000)).toBe(100);
    expect(paiseToRupees(13230000)).toBe(132300);
  });

  it('formats whole rupees with Indian number grouping', () => {
    expect(formatINR(184230000)).toBe('₹18,42,300');
    expect(formatINR(61020000)).toBe('₹6,10,200');
    expect(formatINR(13230000)).toBe('₹1,32,300');
    expect(formatINR(50000)).toBe('₹500');
  });

  it('formats decimals when showDecimals is true', () => {
    expect(formatINR(184230050, { showDecimals: true })).toBe('₹18,42,300.50');
    expect(formatINR(10000, { showDecimals: true })).toBe('₹100.00');
  });

  it('formats Dr/Cr suffixes correctly', () => {
    expect(formatINR(13230000, { drCr: true })).toBe('₹1,32,300 Dr');
    expect(formatINR(-13230000, { drCr: true })).toBe('₹1,32,300 Cr');
  });
});
