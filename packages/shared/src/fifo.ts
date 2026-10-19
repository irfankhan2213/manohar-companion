import { Bill, ISODate, Paise } from './types.js';

export interface RawInvoice {
  id: string;
  billNo: string;
  date: ISODate;
  dueDate?: ISODate;
  amount: Paise;
}

export interface RawReceipt {
  id?: string;
  date: ISODate;
  amount: Paise;
}

export interface FIFOOptions {
  companyId: string;
  partyId: string;
  defaultCreditDays?: number;
}

/**
 * Calculates due date given an invoice date and credit period in days.
 */
function addDays(dateStr: ISODate, days: number): ISODate {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Allocates receipt amounts against invoices in FIFO (First In First Out - oldest first) order.
 * Returns only the bills that have remaining pending amounts, marked as source: 'estimated'.
 */
export function estimateOpenBills(
  invoices: RawInvoice[],
  receipts: RawReceipt[],
  options: FIFOOptions
): Bill[] {
  // Sort invoices ascending by date
  const sortedInvoices = [...invoices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Sum total receipts to allocate
  let remainingReceiptPool = receipts.reduce((sum, r) => sum + r.amount, 0);

  const openBills: Bill[] = [];

  for (const inv of sortedInvoices) {
    if (remainingReceiptPool >= inv.amount) {
      // Fully cleared by receipt pool
      remainingReceiptPool -= inv.amount;
    } else {
      // Partially cleared or completely open
      const pendingAmount = inv.amount - remainingReceiptPool;
      remainingReceiptPool = 0;

      const dueDate =
        inv.dueDate ??
        addDays(inv.date, options.defaultCreditDays ?? 30);

      openBills.push({
        id: inv.id,
        companyId: options.companyId,
        partyId: options.partyId,
        billNo: inv.billNo,
        date: inv.date,
        dueDate,
        amount: inv.amount,
        pending: pendingAmount,
        source: 'estimated',
      });
    }
  }

  return openBills;
}
