import { describe, expect, it } from 'vitest';
import {
  calculateRoundOff,
  formatINR,
  numberToIndianWords,
  paiseToRupees,
  rupeesToPaise,
} from '../src/money.js';

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

  it('converts amounts to Indian currency words', () => {
    expect(numberToIndianWords(rupeesToPaise(0))).toBe('Rupees Zero Only');
    expect(numberToIndianWords(rupeesToPaise(500))).toBe('Rupees Five Hundred Only');
    expect(numberToIndianWords(rupeesToPaise(84200))).toBe('Rupees Eighty Four Thousand Two Hundred Only');
    expect(numberToIndianWords(rupeesToPaise(132300))).toBe('Rupees One Lakh Thirty Two Thousand Three Hundred Only');
    expect(numberToIndianWords(rupeesToPaise(1842300))).toBe('Rupees Eighteen Lakh Forty Two Thousand Three Hundred Only');
  });

  describe('calculateRoundOff', () => {
    it('calculates positive round-off when paise exceeds 50', () => {
      // Subtotal ₹1000 (100000 paise), Tax ₹180.60 (18060 paise) -> Raw ₹1180.60 (118060 paise)
      // Grand total should round up to ₹1181.00 (118100 paise), round-off = +40 paise
      const result = calculateRoundOff(100000, 18060);
      expect(result).toEqual({
        subtotalWithTaxPaise: 118060,
        roundOffPaise: 40,
        grandTotalPaise: 118100,
      });
    });

    it('calculates negative round-off when paise is below 50', () => {
      // Subtotal ₹1000 (100000 paise), Tax ₹180.40 (18040 paise) -> Raw ₹1180.40 (118040 paise)
      // Grand total should round down to ₹1180.00 (118000 paise), round-off = -40 paise
      const result = calculateRoundOff(100000, 18040);
      expect(result).toEqual({
        subtotalWithTaxPaise: 118040,
        roundOffPaise: -40,
        grandTotalPaise: 118000,
      });
    });

    it('calculates zero round-off when amount is an exact rupee', () => {
      // Subtotal ₹1000 (100000 paise), Tax ₹180.00 (18000 paise) -> Raw ₹1180.00 (118000 paise)
      // Grand total should be ₹1180.00 (118000 paise), round-off = 0
      const result = calculateRoundOff(100000, 18000);
      expect(result).toEqual({
        subtotalWithTaxPaise: 118000,
        roundOffPaise: 0,
        grandTotalPaise: 118000,
      });
    });

    it('handles exact .50 paise rounding up', () => {
      // Raw 10050 paise (₹100.50) -> rounds up to 10100 paise (₹101.00), round-off = +50 paise
      const result = calculateRoundOff(10000, 50);
      expect(result).toEqual({
        subtotalWithTaxPaise: 10050,
        roundOffPaise: 50,
        grandTotalPaise: 10100,
      });
    });

    it('handles zero amounts and default tax argument', () => {
      const zeroResult = calculateRoundOff(0);
      expect(zeroResult).toEqual({
        subtotalWithTaxPaise: 0,
        roundOffPaise: 0,
        grandTotalPaise: 0,
      });
    });
  });
});

