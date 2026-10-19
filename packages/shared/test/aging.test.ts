import { describe, expect, it } from 'vitest';
import { calculateAgingSummary, getAgingBucket, getDaysOverdue } from '../src/aging.js';
import { Bill } from '../src/types.js';

describe('aging calculations', () => {
  const today = '2026-10-17';

  it('calculates days overdue correctly', () => {
    expect(getDaysOverdue('2026-10-17', today)).toBe(0);
    expect(getDaysOverdue('2026-10-20', today)).toBe(-3);
    expect(getDaysOverdue('2026-10-02', today)).toBe(15);
    expect(getDaysOverdue('2026-09-02', today)).toBe(45);
  });

  it('maps to correct aging bucket', () => {
    expect(getAgingBucket('2026-10-20', today)).toBe('not_due');
    expect(getAgingBucket('2026-10-17', today)).toBe('not_due');
    expect(getAgingBucket('2026-10-02', today)).toBe('d1_30');
    expect(getAgingBucket('2026-09-02', today)).toBe('d31_60');
    expect(getAgingBucket('2026-07-20', today)).toBe('d61_90');
    expect(getAgingBucket('2026-06-01', today)).toBe('d90_plus');
  });

  it('summarizes multiple bills into calm UI groups', () => {
    const mockBills: Bill[] = [
      {
        id: 'b1',
        companyId: 'c1',
        partyId: 'p1',
        billNo: 'INV-1',
        date: '2026-10-01',
        dueDate: '2026-10-25', // not due
        amount: 1000000,
        pending: 1000000,
        source: 'tally_bill',
      },
      {
        id: 'b2',
        companyId: 'c1',
        partyId: 'p1',
        billNo: 'INV-2',
        date: '2026-09-10',
        dueDate: '2026-10-05', // 12 days late (d1_30)
        amount: 500000,
        pending: 500000,
        source: 'tally_bill',
      },
      {
        id: 'b3',
        companyId: 'c1',
        partyId: 'p1',
        billNo: 'INV-3',
        date: '2026-08-01',
        dueDate: '2026-09-01', // 46 days late (over 30)
        amount: 300000,
        pending: 300000,
        source: 'tally_bill',
      },
    ];

    const summary = calculateAgingSummary(mockBills, today);
    expect(summary.total).toBe(1800000);
    expect(summary.overdue).toBe(800000);
    expect(summary.notDue).toBe(1000000);
    expect(summary.late1to30).toBe(500000);
    expect(summary.over30).toBe(300000);
  });
});
