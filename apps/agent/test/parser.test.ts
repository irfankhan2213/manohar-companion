import { describe, expect, it } from 'vitest';
import {
  parseCompanyInfoResponse,
  parseLedgersResponse,
  parseBillsResponse,
  parseVouchersResponse,
  parseStockItemsResponse,
  parseVoucherImportResponse,
  parseTallyAmount,
} from '../src/tally/parser.js';
import {
  getMockCompanyInfoXml,
  getMockLedgersXml,
  getMockBillsXml,
  getMockVouchersXml,
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

  it('preserves signed credit note amounts and does not flag customer returns as overdue', () => {
    const creditXml = `<ENVELOPE>
      <BODY>
        <DATA>
          <TALLYMESSAGE>
            <BILLS>
              <PARENT>Sample Garments Pvt Ltd</PARENT>
              <BILLREF>CN/001/26-27</BILLREF>
              <BILLDATE>20260901</BILLDATE>
              <BILLDUE>20260915</BILLDUE>
              <CLOSINGBALANCE>25000.00 Cr</CLOSINGBALANCE>
              <ISDEBIT>No</ISDEBIT>
            </BILLS>
          </TALLYMESSAGE>
          <TALLYMESSAGE>
            <BILLS>
              <PARENT>Sample Garments Pvt Ltd</PARENT>
              <BILLREF>RET/002/26-27</BILLREF>
              <BILLDATE>20260905</BILLDATE>
              <BILLDUE>20260920</BILLDUE>
              <CLOSINGBALANCE>12500.00</CLOSINGBALANCE>
              <ISDEBIT>No</ISDEBIT>
            </BILLS>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    const bills = parseBillsResponse(creditXml, '2026-10-17');
    expect(bills.length).toBe(2);

    const cn1 = bills.find((b) => b.billNo === 'CN/001/26-27')!;
    expect(cn1.pendingAmount).toBe(-2500000);
    expect(cn1.openingAmount).toBe(-2500000);
    expect(cn1.isOverdue).toBe(false);
    expect(cn1.daysOverdue).toBe(0);

    const ret2 = bills.find((b) => b.billNo === 'RET/002/26-27')!;
    expect(ret2.pendingAmount).toBe(-1250000);
    expect(ret2.openingAmount).toBe(-1250000);
    expect(ret2.isOverdue).toBe(false);
    expect(ret2.daysOverdue).toBe(0);
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

  it('ensures fully settled bills (0 pending) are not marked overdue even if due date is in the past', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <BODY>
    <DATA>
      <TALLYMESSAGE>
        <BILLS>
          <PARENT>Settled Party Ltd</PARENT>
          <BILLREF>PAID/001/26-27</BILLREF>
          <BILLDATE>20260801</BILLDATE>
          <BILLDUE>20260901</BILLDUE>
          <OPENINGBALANCE>50000.00</OPENINGBALANCE>
          <CLOSINGBALANCE>0.00</CLOSINGBALANCE>
          <ISDEBIT>Yes</ISDEBIT>
        </BILLS>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;

    const bills = parseBillsResponse(xml, '2026-10-17');
    expect(bills.length).toBe(1);
    expect(bills[0]!.pendingAmount).toBe(0);
    expect(bills[0]!.isOverdue).toBe(false);
    expect(bills[0]!.daysOverdue).toBe(0);
  });

  it('parseTallyAmount handles trailing minus and clean zero parsing', () => {
    expect(parseTallyAmount('4500.00-')).toBe(-450000);
    expect(parseTallyAmount('1200.00 Cr')).toBe(-120000);
    expect(parseTallyAmount('1200.00 Dr')).toBe(120000);
    expect(parseTallyAmount(0)).toBe(0);
    expect(parseTallyAmount('')).toBe(0);
  });

  it('parseTallyLedgerBalance correctly normalizes Tally debtor debit signs into positive receivables', () => {
    // Tally exports raw double-entry Debits with negative sign
    const debtorWithMinus = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME="Ad Sewing Machine"><NAME>Ad Sewing Machine</NAME><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>-329430.00</CLOSINGBALANCE><ALTERID>1</ALTERID></LEDGER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const ledgers1 = parseLedgersResponse(debtorWithMinus);
    expect(ledgers1[0]?.closingBalance).toBe(32943000);

    // Tally with explicit Dr
    const debtorWithDr = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME="Ad Sewing Machine"><NAME>Ad Sewing Machine</NAME><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>329430.00 Dr</CLOSINGBALANCE><ALTERID>1</ALTERID></LEDGER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const ledgers2 = parseLedgersResponse(debtorWithDr);
    expect(ledgers2[0]?.closingBalance).toBe(32943000);

    // Tally unsigned
    const debtorUnsigned = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME="Ad Sewing Machine"><NAME>Ad Sewing Machine</NAME><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>329430.00</CLOSINGBALANCE><ALTERID>1</ALTERID></LEDGER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const ledgers3 = parseLedgersResponse(debtorUnsigned);
    expect(ledgers3[0]?.closingBalance).toBe(32943000);

    // Customer advance (Cr)
    const debtorAdvance = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME="Ad Sewing Machine"><NAME>Ad Sewing Machine</NAME><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>50000.00 Cr</CLOSINGBALANCE><ALTERID>1</ALTERID></LEDGER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const ledgers4 = parseLedgersResponse(debtorAdvance);
    expect(ledgers4[0]?.closingBalance).toBe(-5000000);
  });

  it('parses Vouchers XML into Delivery Challans, Receipt Notes, and Invoices', () => {
    const xml = getMockVouchersXml();
    const result = parseVouchersResponse(xml, '2026-10-17');

    expect(result.challans.length).toBe(2);
    const dc = result.challans.find((c) => c.number === 'DC/001/26-27')!;
    expect(dc).toBeDefined();
    expect(dc.partyName).toBe('Sample Garments Pvt Ltd');
    expect(dc.type).toBe('sales');
    expect(dc.lines.length).toBe(1);
    expect(dc.lines[0]?.itemName).toBe('Servo Motor (550W)');
    expect(dc.lines[0]?.qty).toBe(2);
    expect(dc.lines[0]?.rate).toBe(420000);

    const rn = result.challans.find((c) => c.number === 'RN/001/26-27')!;
    expect(rn).toBeDefined();
    expect(rn.partyName).toBe('Standard Sewing Machines Ltd');
    expect(rn.type).toBe('purchase');
    expect(rn.lines.length).toBe(1);
    expect(rn.lines[0]?.itemName).toBe('Hook Assembly - Heavy Duty');

    expect(result.bills.length).toBe(0);
  });

  it('parses real Tally XML with singular BILL tag in COLLECTION', () => {
    const realXml = `
      <ENVELOPE>
        <BODY>
          <DATA>
            <COLLECTION>
              <BILL>
                <BILLDATE>20261015</BILLDATE>
                <BILLREF>INV/101/26-27</BILLREF>
                <BILLDUE>20261115</BILLDUE>
                <PARENT>Real Tally Debtor</PARENT>
                <OPENINGBALANCE>12500.00 Dr</OPENINGBALANCE>
                <CLOSINGBALANCE>12500.00 Dr</CLOSINGBALANCE>
                <ISDEBIT>Yes</ISDEBIT>
              </BILL>
            </COLLECTION>
          </DATA>
        </BODY>
      </ENVELOPE>`;
    const bills = parseBillsResponse(realXml, '2026-10-17');
    expect(bills.length).toBe(1);
    expect(bills[0]?.partyName).toBe('Real Tally Debtor');
    expect(bills[0]?.billNo).toBe('INV/101/26-27');
    expect(bills[0]?.pendingAmount).toBe(1250000);
  });
});
