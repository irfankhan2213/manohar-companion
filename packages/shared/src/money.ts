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
