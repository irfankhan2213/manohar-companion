export interface StockAdjustmentVoucherParams {
  date: string; // YYYYMMDD e.g. 20261017
  voucherNumber: string;
  narration: string;
  itemName: string;
  godownName: string;
  qty: number; // positive = added to stock, negative = removed
  unit: string;
  rateRupees: number;
}

export interface DeliveryChallanVoucherParams {
  date: string; // YYYYMMDD
  voucherNumber: string;
  partyName: string;
  narration: string;
  vehicleNo?: string;
  items: Array<{
    itemName: string;
    godownName?: string;
    qty: number;
    unit: string;
    rateRupees: number;
  }>;
}

export function buildCompanyInfoQuery(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>CompanyInfo</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="CompanyInfo">
            <FORMS>CompanyInfoForm</FORMS>
          </REPORT>
          <FORM NAME="CompanyInfoForm">
            <PARTS>CompanyInfoPart</PARTS>
          </FORM>
          <PART NAME="CompanyInfoPart">
            <LINES>CompanyInfoLine</LINES>
          </PART>
          <LINE NAME="CompanyInfoLine">
            <FIELDS>CompNameField, CompYearField, CompBooksField</FIELDS>
          </LINE>
          <FIELD NAME="CompNameField">
            <SET>##SVCURRENTCOMPANY</SET>
          </FIELD>
          <FIELD NAME="CompYearField">
            <SET>$$String:##SVFROMDATE</SET>
          </FIELD>
          <FIELD NAME="CompBooksField">
            <SET>$$String:##SVTODATE</SET>
          </FIELD>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildLedgersQuery(lastAlterId: number = 0): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomLedgerCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomLedgerCollection" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE, LEDGERPHONE, EMAIL, PARTYGSTIN, BILLCREDITPERIOD, ALTERID</FETCH>
            <FILTER>AlterIdFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="AlterIdFilter">$$Number:$AlterId &gt; ${lastAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildBillsQuery(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>BillsCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="BillsCollection" ISMODIFY="No">
            <TYPE>Bills</TYPE>
            <FETCH>PARENT, BILLDATE, BILLREF, BILLDUE, CLOSINGBALANCE, ISDEBIT</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildStockItemsQuery(lastAlterId: number = 0): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomStockCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomStockCollection" ISMODIFY="No">
            <TYPE>StockItem</TYPE>
            <FETCH>NAME, PARENT, PARTNO, CLOSINGBALANCE, CLOSINGRATE, CLOSINGVALUE, BASEUNITS, ALTERID</FETCH>
            <FILTER>StockAlterFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="StockAlterFilter">$$Number:$AlterId &gt; ${lastAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildStockJournalVoucherXml(params: StockAdjustmentVoucherParams): string {
  const isAddition = params.qty > 0;
  const absQty = Math.abs(params.qty);
  const amount = (absQty * params.rateRupees).toFixed(2);

  // In Tally Stock Journal:
  // INVENTORYENTRIESIN.LIST is Production/Addition
  // INVENTORYENTRIESOUT.LIST is Consumption/Reduction
  const itemBlock = isAddition
    ? `<INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${escapeXml(params.itemName)}</STOCKITEMNAME>
        <GODOWNNAME>${escapeXml(params.godownName)}</GODOWNNAME>
        <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
        <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        <RATE>${params.rateRupees} / ${escapeXml(params.unit)}</RATE>
        <AMOUNT>-${amount}</AMOUNT>
      </INVENTORYENTRIESIN.LIST>`
    : `<INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${escapeXml(params.itemName)}</STOCKITEMNAME>
        <GODOWNNAME>${escapeXml(params.godownName)}</GODOWNNAME>
        <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
        <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        <RATE>${params.rateRupees} / ${escapeXml(params.unit)}</RATE>
        <AMOUNT>${amount}</AMOUNT>
      </INVENTORYENTRIESOUT.LIST>`;

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER VCHTYPE="Stock Journal" ACTION="Create">
          <DATE>${params.date}</DATE>
          <VOUCHERNUMBER>${escapeXml(params.voucherNumber)}</VOUCHERNUMBER>
          <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
          <NARRATION>${escapeXml(params.narration)}</NARRATION>
          ${itemBlock}
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function buildDeliveryChallanVoucherXml(params: DeliveryChallanVoucherParams): string {
  const itemEntries = params.items
    .map((item) => {
      const amount = (item.qty * item.rateRupees).toFixed(2);
      const godownXml = item.godownName
        ? `<GODOWNNAME>${escapeXml(item.godownName)}</GODOWNNAME>`
        : '';
      return `<ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
          ${godownXml}
          <ACTUALQTY>${item.qty} ${escapeXml(item.unit)}</ACTUALQTY>
          <BILLEDQTY>${item.qty} ${escapeXml(item.unit)}</BILLEDQTY>
          <RATE>${item.rateRupees} / ${escapeXml(item.unit)}</RATE>
          <AMOUNT>-${amount}</AMOUNT>
        </ALLINVENTORYENTRIES.LIST>`;
    })
    .join('\n');

  const vehicleNarration = params.vehicleNo
    ? `${params.narration} (Vehicle: ${params.vehicleNo})`
    : params.narration;

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>##SVCURRENTCOMPANY</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER VCHTYPE="Delivery Note" ACTION="Create">
          <DATE>${params.date}</DATE>
          <VOUCHERNUMBER>${escapeXml(params.voucherNumber)}</VOUCHERNUMBER>
          <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
          <PARTYLEDGERNAME>${escapeXml(params.partyName)}</PARTYLEDGERNAME>
          <BASICBUYERNAME>${escapeXml(params.partyName)}</BASICBUYERNAME>
          <NARRATION>${escapeXml(vehicleNarration)}</NARRATION>
          ${itemEntries}
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
