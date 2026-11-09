import { AgingBucket, Bill, ISODate, Paise } from './types.js';

/**
 * Returns today's YYYY-MM-DD calendar date in Indian Standard Time (Asia/Kolkata, UTC+05:30).
 * Eliminates the 5.5-hour midnight-to-05:30 AM IST lag when servers run in UTC.
 */
export function getTodayIST(now: Date = new Date()): ISODate {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  return new Date(now.getTime() + istOffsetMs).toISOString().slice(0, 10);
}

/**
 * Formats a company financialYear (e.g. "2026-27" or "2026-2027") or an ISO date into a compact "YY-YY" FY suffix.
 */
export function getFinancialYearShort(financialYear?: string, dateStr?: ISODate): string {
  if (financialYear && typeof financialYear === 'string') {
    const m = financialYear.trim().match(/(\d{2,4})\s*-\s*(\d{2,4})/);
    if (m && m[1] && m[2]) {
      const start2 = m[1].slice(-2);
      const end2 = m[2].slice(-2);
      return `${start2}-${end2}`;
    }
  }
  const ref = dateStr ? parseISODate(dateStr) : parseISODate(getTodayIST());
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth() + 1; // 1-12
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

export function parseISODate(dateStr: ISODate): Date {
  const clean = (dateStr || '').slice(0, 10);
  const [year, month, day] = clean.split('-').map(Number);
  return new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
}

export function getDaysOverdue(dueDate: ISODate, today: ISODate = getTodayIST()): number {
  const due = parseISODate(dueDate);
  const current = parseISODate(today);
  const diffMs = current.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getAgingBucket(dueDate: ISODate, today: ISODate = getTodayIST()): AgingBucket {
  const days = getDaysOverdue(dueDate, today);
  if (days <= 0) return 'not_due';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

export interface AgingSummary {
  total: Paise;
  overdue: Paise;
  notDue: Paise;
  late1to30: Paise;
  over30: Paise;
  byBucket: Record<AgingBucket, { count: number; amount: Paise }>;
}

export function calculateAgingSummary(bills: Bill[], today: ISODate): AgingSummary {
  const byBucket: Record<AgingBucket, { count: number; amount: Paise }> = {
    not_due: { count: 0, amount: 0 },
    d1_30: { count: 0, amount: 0 },
    d31_60: { count: 0, amount: 0 },
    d61_90: { count: 0, amount: 0 },
    d90_plus: { count: 0, amount: 0 },
  };

  let total: Paise = 0;
  let overdue: Paise = 0;

  for (const bill of bills) {
    const amount = bill.pending;
    total += amount;

    // Credit notes and settled bills reduce/clear total receivables, but are not overdue invoices
    if (amount <= 0) continue;

    const bucket = getAgingBucket(bill.dueDate, today);
    const bucketEntry = byBucket[bucket];
    if (bucketEntry) {
      bucketEntry.count += 1;
      bucketEntry.amount += amount;
    }

    if (bucket !== 'not_due') {
      overdue += amount;
    }
  }

  const notDue = byBucket.not_due.amount;
  const late1to30 = byBucket.d1_30.amount;
  const over30 =
    byBucket.d31_60.amount + byBucket.d61_90.amount + byBucket.d90_plus.amount;

  return {
    total,
    overdue,
    notDue,
    late1to30,
    over30,
    byBucket,
  };
}
