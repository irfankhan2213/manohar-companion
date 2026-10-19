import { AgingBucket, Bill, ISODate, Paise } from './types.js';

export function parseISODate(dateStr: ISODate): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
}

export function getDaysOverdue(dueDate: ISODate, today: ISODate): number {
  const due = parseISODate(dueDate);
  const current = parseISODate(today);
  const diffMs = current.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getAgingBucket(dueDate: ISODate, today: ISODate): AgingBucket {
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
    const bucket = getAgingBucket(bill.dueDate, today);
    const amount = bill.pending;
    total += amount;

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
