import { describe, expect, it } from 'vitest';
import { estimateOpenBills, RawInvoice, RawReceipt } from '../src/fifo.js';
import { rupeesToPaise } from '../src/money.js';

describe('FIFO bill estimator', () => {
  it('correctly allocates receipt to oldest invoices as per the spec story', () => {
    // 5 invoices in date order:
    // 90,720 + 90,720 + 1,05,840 + 1,05,840 + 26,460
    // Total invoiced: 4,19,580
    // Receipt of 2,87,280 clears exactly the first 3 invoices (90,720 + 90,720 + 1,05,840 = 2,87,280)
    // Leaving open: 1,05,840 and 26,460, total 1,32,300
    const invoices: RawInvoice[] = [
      {
        id: 'inv-1',
        billNo: 'GST/001/26-27',
        date: '2026-05-10',
        amount: rupeesToPaise(90720),
      },
      {
        id: 'inv-2',
        billNo: 'GST/002/26-27',
        date: '2026-05-20',
        amount: rupeesToPaise(90720),
      },
      {
        id: 'inv-3',
        billNo: 'GST/003/26-27',
        date: '2026-06-01',
        amount: rupeesToPaise(105840),
      },
      {
        id: 'inv-4',
        billNo: 'GST/004/26-27',
        date: '2026-06-15',
        amount: rupeesToPaise(105840),
      },
      {
        id: 'inv-5',
        billNo: 'GST/005/26-27',
        date: '2026-07-01',
        amount: rupeesToPaise(26460),
      },
    ];

    const receipts: RawReceipt[] = [
      {
        date: '2026-06-10',
        amount: rupeesToPaise(287280),
      },
    ];

    const openBills = estimateOpenBills(invoices, receipts, {
      companyId: 'c1',
      partyId: 'sample-garments',
      defaultCreditDays: 30,
    });

    expect(openBills).toHaveLength(2);

    expect(openBills[0]?.id).toBe('inv-4');
    expect(openBills[0]?.pending).toBe(rupeesToPaise(105840));
    expect(openBills[0]?.source).toBe('estimated');

    expect(openBills[1]?.id).toBe('inv-5');
    expect(openBills[1]?.pending).toBe(rupeesToPaise(26460));
    expect(openBills[1]?.source).toBe('estimated');

    const totalPending = openBills.reduce((acc, b) => acc + b.pending, 0);
    expect(totalPending).toBe(rupeesToPaise(132300));
  });

  it('handles partial clearance of an invoice', () => {
    const invoices: RawInvoice[] = [
      {
        id: 'inv-1',
        billNo: 'INV-101',
        date: '2026-08-01',
        amount: rupeesToPaise(50000),
      },
      {
        id: 'inv-2',
        billNo: 'INV-102',
        date: '2026-08-15',
        amount: rupeesToPaise(50000),
      },
    ];

    const receipts: RawReceipt[] = [
      {
        date: '2026-08-20',
        amount: rupeesToPaise(70000),
      },
    ];

    const openBills = estimateOpenBills(invoices, receipts, {
      companyId: 'c1',
      partyId: 'p2',
    });

    expect(openBills).toHaveLength(1);
    expect(openBills[0]?.id).toBe('inv-2');
    expect(openBills[0]?.pending).toBe(rupeesToPaise(30000));
    expect(openBills[0]?.amount).toBe(rupeesToPaise(50000));
  });
});
