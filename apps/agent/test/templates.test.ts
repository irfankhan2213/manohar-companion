import { describe, expect, it } from 'vitest';
import {
  buildCompanyInfoQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildVouchersQuery,
  buildStockItemsQuery,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
} from '../src/tally/templates.js';

describe('Tally XML Templates', () => {
  it('generates company info query XML', () => {
    const xml = buildCompanyInfoQuery();
    expect(xml).toContain('<TALLYREQUEST>Export</TALLYREQUEST>');
    expect(xml).toContain('<ID>CompanyInfo</ID>');
    expect(xml).toContain('##SVCURRENTCOMPANY');
  });

  it('generates ledgers query with AlterID filter', () => {
    const xml = buildLedgersQuery(1450);
    expect(xml).toContain('<TYPE>Ledger</TYPE>');
    expect(xml).toContain('AlterId &gt; 1450');
  });

  it('generates bills query XML', () => {
    const xml = buildBillsQuery();
    expect(xml).toContain('<TYPE>Bills</TYPE>');
    expect(xml).toContain('BILLREF');
  });

  it('generates vouchers query XML for challans and invoices', () => {
    const xml = buildVouchersQuery('Manohar Traders');
    expect(xml).toContain('<TYPE>Voucher</TYPE>');
    expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
    expect(xml).toContain('ALLINVENTORYENTRIES.LIST');
  });

  it('generates stock items query with AlterID filter', () => {
    const xml = buildStockItemsQuery(1420);
    expect(xml).toContain('<TYPE>StockItem</TYPE>');
    expect(xml).toContain('StockAlterFilter');
    expect(xml).toContain('AlterId &gt; 1420');
  });

  it('generates stock journal voucher XML with GODOWNNAME inside BATCHALLOCATIONS.LIST', () => {
    const xml = buildStockJournalVoucherXml({
      date: '20261017',
      voucherNumber: 'ADJ/001',
      narration: 'Physical stock damaged',
      itemName: 'Servo Motor 550W (Direct Drive)',
      godownName: 'Ludhiana Main Godown',
      qty: -2,
      unit: 'pcs',
      rateRupees: 4200,
    });

    expect(xml).toContain('<VOUCHER VCHTYPE="Stock Journal" ACTION="Create">');
    expect(xml).toContain('<INVENTORYENTRIESOUT.LIST>');
    expect(xml).toContain('<ACTUALQTY>2 pcs</ACTUALQTY>');
    expect(xml).toContain('<AMOUNT>8400.00</AMOUNT>');
    expect(xml).toContain('<BATCHALLOCATIONS.LIST>');
    expect(xml).toContain('<GODOWNNAME>Ludhiana Main Godown</GODOWNNAME>');
    expect(xml).toContain('<BATCHNAME>Primary Batch</BATCHNAME>');
  });

  it('generates delivery challan voucher XML with GODOWNNAME inside BATCHALLOCATIONS.LIST', () => {
    const xml = buildDeliveryChallanVoucherXml({
      date: '20261017',
      voucherNumber: 'DC/042/26-27',
      partyName: 'Sample Garments Pvt Ltd',
      narration: 'Dispatched via Golden Goods Transport',
      vehicleNo: 'PB-10-CZ-8821',
      items: [
        {
          itemName: 'Servo Motor 550W (Direct Drive)',
          godownName: 'Ludhiana Main Godown',
          qty: 10,
          unit: 'pcs',
          rateRupees: 4200,
        },
      ],
    });

    expect(xml).toContain('<VOUCHER VCHTYPE="Delivery Note" ACTION="Create"');
    expect(xml).toContain('<PARTYLEDGERNAME>Sample Garments Pvt Ltd</PARTYLEDGERNAME>');
    expect(xml).toContain('(Vehicle: PB-10-CZ-8821)');
    expect(xml).toContain('<ACTUALQTY>10 pcs</ACTUALQTY>');
    expect(xml).toContain('<BATCHALLOCATIONS.LIST>');
    expect(xml).toContain('<GODOWNNAME>Ludhiana Main Godown</GODOWNNAME>');
    expect(xml).toContain('<BATCHNAME>Primary Batch</BATCHNAME>');
  });

  it('escapeXml safely handles undefined, null and special XML characters', async () => {
    const { escapeXml } = await import('../src/tally/templates.js');
    expect(escapeXml(undefined)).toBe('');
    expect(escapeXml(null)).toBe('');
    expect(escapeXml('')).toBe('');
    expect(escapeXml(0)).toBe('0');
    expect(escapeXml(123)).toBe('123');
    expect(escapeXml('A & B < C > "D" \'E\'')).toBe('A &amp; B &lt; C &gt; &quot;D&quot; &apos;E&apos;');
  });
});
