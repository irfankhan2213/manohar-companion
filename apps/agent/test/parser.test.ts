import { describe, expect, it } from 'vitest';
import {
  parseCompanyInfoResponse,
  parseLedgersResponse,
  parseBillsResponse,
  parseStockItemsResponse,
  parseVoucherImportResponse,
  parseTallyAmount,
} from '../src/tally/parser.js';
import {
  getMockCompanyInfoXml,
  getMockLedgersXml,
  getMockBillsXml,
  getMockStockItemsXml,
  getMockVoucherImportResponseXml,
} from '../src/tally/mock.js';

describe('Tally Parser', () => {
  it('parses Tally amount strings into paise integers', () => {
    expect(parseTallyAmount('105840.00 Dr')).toBe(10584000); // positive for debit
    expect(parseTallyAmount('350000.00 Cr')).toBe(-35000000); // negative for credit
    expect(parseTallyAmount('4200')).toBe(420000);
    expect(parseTallyAmount(0)).toBe(0);
    expect(parseTallyAmount('')).toBe(0);
  });

  it('parses Company Info XML correctly', () => {
    const xml = getMockCompanyInfoXml();
    const info = parseCompanyInfoResponse(xml);

    expect(info.name).toBe('Manohar Traders');
    expect(info.financialYearFrom).toBe('2026-04-01');
  });

  it('parses Ledgers XML with debtor classification and AlterID', () => {
    const xml = getMockLedgersXml(0);
    const ledgers = parseLedgersResponse(xml);

    expect(ledgers.length).toBe(5);

    const sample = ledgers.find((l) => l.name === 'Sample Garments Pvt Ltd')!;
    expect(sample).toBeDefined();
    expect(sample.isSundryDebtor).toBe(true);
    expect(sample.isSundryCreditor).toBe(false);
    expect(sample.closingBalance).toBe(10584000); // 1,05,840 * 100 paise
    expect(sample.phone).toBe('+91 98390 12345');
    expect(sample.alterId).toBe(1475);

    const vendor = ledgers.find((l) => l.name === 'Golden Yarns & Fibres')!;
    expect(vendor).toBeDefined();
    expect(vendor.isSundryCreditor).toBe(true);
    expect(vendor.closingBalance).toBe(-35000000);
  });

  it('parses Bills XML with overdue tracking', () => {
    const xml = getMockBillsXml();
    const bills = parseBillsResponse(xml, '2026-10-17');

    expect(bills.length).toBe(4);
    const bill1 = bills.find((b) => b.billNo === 'GST/004/26-27')!;
    expect(bill1.partyName).toBe('Sample Garments Pvt Ltd');
    expect(bill1.pendingAmount).toBe(10584000);
    expect(bill1.dueDate).toBe('2026-10-10');
    expect(bill1.isOverdue).toBe(true);
    expect(bill1.daysOverdue).toBe(7);
  });

  it('parses Stock Items XML with quantities and rates', () => {
    const xml = getMockStockItemsXml(0);
    const items = parseStockItemsResponse(xml);

    expect(items.length).toBe(4);
    const motor = items.find((i) => i.name.includes('Servo Motor'))!;
    expect(motor).toBeDefined();
    expect(motor.closingQty).toBe(18);
    expect(motor.baseUnits).toBe('pcs');
    expect(motor.closingRate).toBe(420000); // ₹4,200 in paise
    expect(motor.alterId).toBe(1476);
  });

  it('parses Voucher Import response XML', () => {
    const xml = getMockVoucherImportResponseXml();
    const result = parseVoucherImportResponse(xml);

    expect(result.success).toBe(true);
    expect(result.created).toBe(1);
    expect(result.errors).toBe(0);
  });
});
