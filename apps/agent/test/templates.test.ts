import { describe, expect, it } from 'vitest';
import {
  buildCompanyInfoQuery,
  buildLedgersQuery,
  buildBillsQuery,
  buildVouchersQuery,
  buildStockItemsQuery,
  buildStockJournalVoucherXml,
  buildDeliveryChallanVoucherXml,
  buildVoucherManifestQuery,
  buildVouchersIncrementalQuery,
  buildUniversalVoucherXml,
  buildStockItemMasterXml,
  buildLedgerMasterXml,
} from '../src/tally/templates.js';

describe('Tally XML Templates', () => {
  it('generates company info query XML', () => {
    const xml = buildCompanyInfoQuery();
    expect(xml).toContain('<TALLYREQUEST>Export</TALLYREQUEST>');
    expect(xml).toContain('<ID>CompanyInfo</ID>');
    expect(xml).toContain('$$CurrentCompany');
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
    expect(xml).toContain('<LEDGERNAME>Sales</LEDGERNAME>');
  });

  it('generates delivery challan voucher XML with custom sales ledger or purchase ledger', () => {
    const salesXml = buildDeliveryChallanVoucherXml({
      date: '20261117',
      voucherNumber: 'DC/046/26-27',
      partyName: 'Anam Delhi',
      narration: 'Dispatched to Delhi',
      voucherType: 'delivery',
      salesLedgerName: 'Sales',
      items: [{ itemName: '300 L PILY', qty: 10, unit: 'pcs', rateRupees: 105 }],
    });
    expect(salesXml).toContain('<VOUCHER VCHTYPE="Delivery Note" ACTION="Create"');
    expect(salesXml).toContain('<PARTYLEDGERNAME>Anam Delhi</PARTYLEDGERNAME>');
    expect(salesXml).toContain('<LEDGERNAME>Sales</LEDGERNAME>');
    expect(salesXml).not.toContain('<LEDGERNAME>Sales Account</LEDGERNAME>');

    const purchaseXml = buildDeliveryChallanVoucherXml({
      date: '20261117',
      voucherNumber: 'RC/001/26-27',
      partyName: 'Supplier ABC',
      narration: 'Received from supplier',
      voucherType: 'purchase',
      items: [{ itemName: 'Raw Material', qty: 5, unit: 'pcs', rateRupees: 200 }],
    });
    expect(purchaseXml).toContain('<LEDGERNAME>PURCHASE</LEDGERNAME>');
    expect(purchaseXml).not.toContain('<LEDGERNAME>Purchase Account</LEDGERNAME>');
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

  it('generates voucher manifest query XML with company scoping and export format', () => {
    const xml = buildVoucherManifestQuery('Manohar Traders');
    expect(xml).toContain('<ID>VoucherManifestCollection</ID>');
    expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
    expect(xml).toContain('<FETCH>MASTERID, ALTERID, VOUCHERNUMBER, VOUCHERTYPENAME, DATE, GUID</FETCH>');
  });

  it('generates incremental vouchers query with numeric AlterId formula and date range', () => {
    const xml = buildVouchersIncrementalQuery(1500, 'Manohar Traders', '20260401', '20261031');
    expect(xml).toContain('<ID>IncrementalVouchersCollection</ID>');
    expect(xml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
    expect(xml).toContain('<SVFROMDATE>20260401</SVFROMDATE>');
    expect(xml).toContain('<SVTODATE>20261031</SVTODATE>');
    expect(xml).toContain('<FILTER>IsChallanFilter</FILTER>');
    expect(xml).toContain('<FILTER>VoucherAlterFilter</FILTER>');
    expect(xml).toContain('NAME="IsChallanFilter"');
    expect(xml).toContain('$$Number:$AlterId &gt; 1500');
  });

  it('retains SVEXPORTFORMAT along with SVCURRENTCOMPANY in voucher mutation XML templates', () => {
    const journalXml = buildStockJournalVoucherXml({
      date: '20261017',
      voucherNumber: 'ADJ/001',
      narration: 'Damaged stock',
      itemName: 'Servo Motor 550W (Direct Drive)',
      godownName: 'Shop Godown',
      qty: -1,
      unit: 'pcs',
      rateRupees: 4200,
      companyName: 'Manohar Traders',
    });
    expect(journalXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    expect(journalXml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');

    const challanXml = buildDeliveryChallanVoucherXml({
      date: '20261017',
      voucherNumber: 'DC/001/26-27',
      partyName: 'Sample Garments Pvt Ltd',
      narration: 'Delivery note',
      companyName: 'Manohar Traders',
      items: [
        {
          itemName: 'Servo Motor 550W (Direct Drive)',
          godownName: 'Shop Godown',
          qty: 2,
          unit: 'pcs',
          rateRupees: 4200,
        },
      ],
    });
    expect(challanXml).toContain('<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>');
    expect(challanXml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
  });

  describe('Universal Accounting Voucher Generation (Livekeeping Parity)', () => {
    it('generates compliant Receipt voucher XML with double-entry ledgers and BillAllocations', () => {
      const xml = buildUniversalVoucherXml({
        companyName: '1234 (M T M)',
        voucherType: 'Receipt',
        voucherNumber: 'RCT-2026-001',
        date: '20261115',
        partyLedgerName: 'Rahul Textiles',
        narration: 'Payment received via HDFC Bank NEFT against bill INV-101',
        ledgerEntries: [
          {
            ledgerName: 'HDFC Bank',
            amount: 15000,
            isDeemedPositive: true,
          },
          {
            ledgerName: 'Rahul Textiles',
            amount: 15000,
            isDeemedPositive: false,
            isPartyLedger: true,
            billAllocations: [
              {
                billRef: 'INV-101',
                billType: 'Agst Ref',
                amount: 15000,
              },
            ],
          },
        ],
      });

      expect(xml).toContain('<TALLYREQUEST>Import</TALLYREQUEST>');
      expect(xml).toContain('<SVCURRENTCOMPANY>1234 (M T M)</SVCURRENTCOMPANY>');
      expect(xml).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">');
      expect(xml).toContain('<VOUCHERNUMBER>RCT-2026-001</VOUCHERNUMBER>');
      expect(xml).toContain('<PARTYLEDGERNAME>Rahul Textiles</PARTYLEDGERNAME>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      expect(xml).toContain('<AMOUNT>-15000.00</AMOUNT>');
      expect(xml).toContain('<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      expect(xml).toContain('<AMOUNT>15000.00</AMOUNT>');
      expect(xml).toContain('<BILLALLOCATIONS.LIST>');
      expect(xml).toContain('<NAME>INV-101</NAME>');
      expect(xml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');
    });

    it('generates compliant Sales voucher XML with inventory allocations', () => {
      const xml = buildUniversalVoucherXml({
        companyName: 'Manohar Traders',
        voucherType: 'Sales',
        voucherNumber: 'INV-999',
        date: '20261115',
        partyLedgerName: 'Shree Krishna Enterprises',
        narration: 'Direct sales invoice',
        ledgerEntries: [
          {
            ledgerName: 'Shree Krishna Enterprises',
            amount: 8400,
            isDeemedPositive: true,
            isPartyLedger: true,
          },
          {
            ledgerName: 'Sales Account',
            amount: 8400,
            isDeemedPositive: false,
          },
        ],
        inventoryEntries: [
          {
            itemName: 'Servo Motor 550W',
            qty: 2,
            unit: 'pcs',
            rateRupees: 4200,
            amountRupees: 8400,
            godownName: 'Main Location',
          },
        ],
      });

      expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">');
      expect(xml).toContain('<STOCKITEMNAME>Servo Motor 550W</STOCKITEMNAME>');
      expect(xml).toContain('<RATE>4200.00 / pcs</RATE>');
      expect(xml).toContain('<ACTUALQTY>2 pcs</ACTUALQTY>');
      expect(xml).toContain('<GODOWNNAME>Main Location</GODOWNNAME>');
    });
  });

  describe('Bidirectional App -> Tally Master & Idempotency XML', () => {
    it('generates Stock Item Master Create/Alter XML under All Masters', () => {
      const xml = buildStockItemMasterXml({
        companyName: 'Manohar Traders',
        action: 'Alter',
        name: 'Servo Motor 750W',
        oldName: 'Servo Motor 550W',
        unit: 'pcs',
        group: 'Motors',
        partNo: 'SM-750',
        hsnCode: '8501',
        gstRate: 18,
      });

      expect(xml).toContain('<ID>All Masters</ID>');
      expect(xml).toContain('<SVCURRENTCOMPANY>Manohar Traders</SVCURRENTCOMPANY>');
      expect(xml).toContain('<UNIT NAME="pcs" ACTION="Alter">');
      expect(xml).toContain('<STOCKGROUP NAME="Motors" ACTION="Alter">');
      expect(xml).toContain('<STOCKITEM NAME="Servo Motor 550W" ACTION="Alter">');
      expect(xml).toContain('<NAME>Servo Motor 750W</NAME>');
      expect(xml).toContain('<BASEUNITS>pcs</BASEUNITS>');
      expect(xml).toContain('<HSNCODE>8501</HSNCODE>');
      expect(xml).toContain('<GSTAPPLICABLE>Applicable</GSTAPPLICABLE>');
    });

    it('generates Party Ledger Master Create/Alter XML under All Masters', () => {
      const xml = buildLedgerMasterXml({
        companyName: 'Manohar Traders',
        action: 'Create',
        name: 'Asha Garments',
        parentGroup: 'Sundry Debtors',
        phone: '9876543210',
        city: 'Ludhiana',
        gstin: '03AABCA1234A1Z5',
        creditDays: 45,
        openingBalanceRupees: 12500,
      });

      expect(xml).toContain('<ID>All Masters</ID>');
      expect(xml).toContain('<LEDGER NAME="Asha Garments" ACTION="Create">');
      expect(xml).toContain('<PARENT>Sundry Debtors</PARENT>');
      expect(xml).toContain('<LEDGERPHONE>9876543210</LEDGERPHONE>');
      expect(xml).toContain('<PARTYGSTIN>03AABCA1234A1Z5</PARTYGSTIN>');
      expect(xml).toContain('<BILLCREDITPERIOD>45 Days</BILLCREDITPERIOD>');
      expect(xml).toContain('<OPENINGBALANCE>-12500.00</OPENINGBALANCE>');
    });

    it('includes GUID, REMOTEID, and balanced Round Off entry on Delivery Challan XML', () => {
      const xml = buildDeliveryChallanVoucherXml({
        companyName: 'Manohar Traders',
        date: '20261122',
        voucherNumber: 'SC/050/26-27',
        partyName: 'Asha Garments',
        narration: 'Sales challan with round off',
        voucherType: 'sales',
        guid: 'saas-challan-ch-50',
        roundOffRupees: 0.4,
        items: [{ itemName: 'Servo Motor 750W', qty: 1, unit: 'pcs', rateRupees: 99.6 }],
      });

      expect(xml).toContain('REMOTEID="saas-challan-ch-50"');
      expect(xml).toContain('<GUID>saas-challan-ch-50</GUID>');
      expect(xml).toContain('<LEDGERNAME>Round Off</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-100.00</AMOUNT>');
    });

    it('does not embed Master tags inside Stock Journal Vouchers XML', () => {
      const xml = buildStockJournalVoucherXml({
        date: '20261122',
        voucherNumber: 'ADJ/002',
        narration: 'Audit count',
        itemName: 'Servo Motor 750W',
        godownName: 'Main Location',
        qty: 5,
        unit: 'pcs',
        rateRupees: 4000,
        guid: 'saas-sj-out-2',
      });

      expect(xml).toContain('<ID>Vouchers</ID>');
      expect(xml).toContain('REMOTEID="saas-sj-out-2"');
      expect(xml).not.toContain('<UNIT ACTION="Create"');
      expect(xml).not.toContain('<STOCKITEM ACTION="Alter"');
    });
  });
});
