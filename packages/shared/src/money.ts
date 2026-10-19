import { Paise } from './types.js';

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

export interface FormatINROptions {
  showDecimals?: boolean;
  drCr?: boolean;
  symbol?: boolean;
}

/**
 * Format a paise integer into Indian currency string: e.g. ₹18,42,300 or ₹18,42,300.50
 * Handles Dr/Cr suffix when enabled.
 */
export function formatINR(paise: Paise, options: FormatINROptions = {}): string {
  const { showDecimals = false, drCr = false, symbol = true } = options;

  const isCredit = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = absPaise / 100;

  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });

  const formattedNum = formatter.format(rupees);
  const prefix = symbol ? '₹' : '';

  if (drCr) {
    const suffix = isCredit ? ' Cr' : ' Dr';
    return `${prefix}${formattedNum}${suffix}`;
  }

  const sign = isCredit ? '-' : '';
  return `${sign}${prefix}${formattedNum}`;
}

/**
 * Convert paise amount to formal Indian currency words: e.g. "Rupees Eighty Four Thousand Two Hundred Only"
 */
export function numberToIndianWords(paise: Paise): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  if (rupees === 0) return 'Rupees Zero Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function convertTwoDigits(num: number): string {
    if (num === 0) return '';
    if (num < 20) return ones[num]!;
    const t = Math.floor(num / 10);
    const o = num % 10;
    return tens[t]! + (o > 0 ? ' ' + ones[o] : '');
  }

  function convertThreeDigits(num: number): string {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    let res = '';
    if (h > 0) {
      res += ones[h] + ' Hundred';
      if (rest > 0) res += ' ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundredAndBelow = rupees % 1000;

  let words = 'Rupees ';
  if (crore > 0) {
    words += convertTwoDigits(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertTwoDigits(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertTwoDigits(thousand) + ' Thousand ';
  }
  if (hundredAndBelow > 0) {
    words += convertThreeDigits(hundredAndBelow) + ' ';
  }
  words += 'Only';
  return words.trim();
}

