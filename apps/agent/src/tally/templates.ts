export function getCurrentIndianFYDates(refDate: Date = new Date()): { fromDate: string; toDate: string } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1; // 1-12
  const fyStartYear = month >= 4 ? year : year - 1;
  return {
    fromDate: `${fyStartYear}0401`,
    toDate: `${fyStartYear + 1}0331`,
  };
}

export interface StockAdjustmentVoucherParams {
  date: string; // YYYYMMDD e.g. 20261017
  voucherNumber: string;
  narration: string;
  itemName: string;
  godownName: string;
  qty: number; // positive = added to stock, negative = removed
  unit: string;
  rateRupees: number;
  companyName?: string;
  guid?: string;
}

export interface DeliveryChallanVoucherParams {
  date: string; // YYYYMMDD
  voucherNumber: string;
  partyName: string;
  narration: string;
  vehicleNo?: string;
  voucherType?: 'sales' | 'purchase' | 'delivery' | 'receipt_note';
  companyName?: string;
  salesLedgerName?: string;
  roundOffRupees?: number;
  guid?: string;
  items: Array<{
    itemName: string;
    godownName?: string;
    qty: number;
    unit: string;
    rateRupees: number;
  }>;
}

export interface StockItemMasterParams {
  action?: 'Create' | 'Alter';
  name: string;
  oldName?: string;
  unit?: string;
  group?: string;
  partNo?: string;
  alias?: string;
  hsnCode?: string;
  gstRate?: number;
  description?: string;
  rateRupees?: number;
  companyName?: string;
}

export interface LedgerMasterParams {
  action?: 'Create' | 'Alter';
  name: string;
  oldName?: string;
  parentGroup?: string;
  phone?: string;
  city?: string;
  gstin?: string;
  creditDays?: number;
  openingBalanceRupees?: number;
  companyName?: string;
}

export function buildCompanyInfoQuery(companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
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
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
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
            <SET>$$IfEmpty:##SVCURRENTCOMPANY:$$CurrentCompany</SET>
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

export function buildOpenCompaniesQuery(): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ListOfOpenCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ListOfOpenCompanies" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>NAME, STARTINGFROM, BOOKSFROM, PARTYGSTIN, GSTIN, GUID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildLedgersQuery(lastAlterId: number = 0, companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
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
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
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

export function buildBillsQuery(companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
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
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="BillsCollection" ISMODIFY="No">
            <TYPE>Bills</TYPE>
            <FETCH>PARENT, BILLDATE, BILLREF, BILLDUE, OPENINGBALANCE, CLOSINGBALANCE, ISDEBIT</FETCH>
            <FILTER>ActiveBillsFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="ActiveBillsFilter">NOT $$IsEmpty:$BILLREF</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildVouchersQuery(companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomVouchersCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomVouchersCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERNUMBER, DATE, VOUCHERTYPENAME, PARTYLEDGERNAME, PARTYNAME, BASICBUYERNAME, NARRATION, ALLINVENTORYENTRIES.LIST</FETCH>
            <FILTER>IsChallanFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="IsChallanFilter">$$IsDeliveryNote:$VoucherTypeName or $$IsReceiptNote:$VoucherTypeName or $VoucherTypeName contains "Delivery" or $VoucherTypeName contains "Receipt Note" or $VoucherTypeName contains "Challan"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildVoucherManifestQuery(companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherManifestCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VoucherManifestCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, VOUCHERNUMBER, VOUCHERTYPENAME, DATE, GUID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildVouchersIncrementalQuery(
  minAlterId: number = 0,
  companyName?: string,
  fromDate?: string,
  toDate?: string
): string {
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  const fromDateTag = fromDate ? `\n        <SVFROMDATE>${fromDate}</SVFROMDATE>` : '';
  const toDateTag = toDate ? `\n        <SVTODATE>${toDate}</SVTODATE>` : '';
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>IncrementalVouchersCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}${fromDateTag}${toDateTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="IncrementalVouchersCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERNUMBER, DATE, VOUCHERTYPENAME, PARTYLEDGERNAME, PARTYNAME, BASICBUYERNAME, NARRATION, ISCANCELLED, ISOPTIONAL, ALLINVENTORYENTRIES.LIST, LEDGERENTRIES.LIST</FETCH>
            <FILTER>IsChallanFilter</FILTER>
            <FILTER>VoucherAlterFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="IsChallanFilter">$$IsDeliveryNote:$VoucherTypeName or $$IsReceiptNote:$VoucherTypeName or $VoucherTypeName contains "Delivery" or $VoucherTypeName contains "Receipt Note" or $VoucherTypeName contains "Challan"</SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="VoucherAlterFilter">$$Number:$AlterId &gt; ${minAlterId}</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildAllVouchersQuery(
  minAlterId: number = 0,
  companyName?: string,
  fromDate?: string,
  toDate?: string,
  voucherType?: string
): string {
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  const fromDateTag = fromDate ? `\n        <SVFROMDATE>${fromDate}</SVFROMDATE>` : '';
  const toDateTag = toDate ? `\n        <SVTODATE>${toDate}</SVTODATE>` : '';
  const typeFilter = voucherType
    ? `\n          <SYSTEM TYPE="Formulae" NAME="VoucherTypeFilter">$$IsSysNameEqual:$VoucherTypeName:"${escapeXml(voucherType)}"</SYSTEM>`
    : '';
  const filterTag = voucherType
    ? `\n            <FILTER>VoucherAlterFilter</FILTER>\n            <FILTER>VoucherTypeFilter</FILTER>`
    : `\n            <FILTER>VoucherAlterFilter</FILTER>`;

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllVouchersCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}${fromDateTag}${toDateTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllVouchersCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>MASTERID, ALTERID, GUID, VOUCHERNUMBER, DATE, VOUCHERTYPENAME, PARTYLEDGERNAME, PARTYNAME, BASICBUYERNAME, NARRATION, ISCANCELLED, ISOPTIONAL, ALLINVENTORYENTRIES.LIST, LEDGERENTRIES.LIST</FETCH>${filterTag}
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="VoucherAlterFilter">$$Number:$AlterId &gt; ${minAlterId}</SYSTEM>${typeFilter}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildGroupsQuery(companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>GroupsCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="GroupsCollection" ISMODIFY="No">
            <TYPE>Group</TYPE>
            <FETCH>NAME, PARENT, ISADDABLE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildStockItemsQuery(lastAlterId: number = 0, companyName?: string): string {
  const { fromDate, toDate } = getCurrentIndianFYDates();
  const companyTag = companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`
    : '';
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
        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${toDate}</SVTODATE>${companyTag}
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

/**
 * Bidirectional App -> Tally Master Sync: Create or Alter a Stock Item in TallyPrime.
 * Uses <ID>All Masters</ID> with ACTION="Alter" (which creates if missing or updates if existing).
 */
export function buildStockItemMasterXml(params: StockItemMasterParams): string {
  const companyTag = params.companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(params.companyName)}</SVCURRENTCOMPANY>`
    : '';
  const unit = (params.unit || 'pcs').trim();
  const group = (params.group || '').trim();
  const targetAttrName = (params.oldName && params.oldName.trim()) ? params.oldName.trim() : params.name.trim();
  const action = params.action || 'Alter';

  const groupMessage =
    group && group.toLowerCase() !== 'primary' && group.toLowerCase() !== 'general'
      ? `\n      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <STOCKGROUP NAME="${escapeXml(group)}" ACTION="Alter">
          <NAME.LIST>
            <NAME>${escapeXml(group)}</NAME>
          </NAME.LIST>
          <PARENT/>
        </STOCKGROUP>
      </TALLYMESSAGE>`
      : '';

  const parentTag =
    group && group.toLowerCase() !== 'primary' && group.toLowerCase() !== 'general'
      ? `\n          <PARENT>${escapeXml(group)}</PARENT>`
      : '\n          <PARENT/>';

  const partNoTag = params.partNo
    ? `\n          <MAILINGNAME.LIST TYPE="String">\n            <MAILINGNAME>${escapeXml(params.partNo)}</MAILINGNAME>\n          </MAILINGNAME.LIST>`
    : '';
  const aliasLine = params.alias && params.alias.trim() && params.alias.trim() !== params.name.trim()
    ? `\n            <NAME>${escapeXml(params.alias.trim())}</NAME>`
    : '';
  const descTag = params.description
    ? `\n          <DESCRIPTION>${escapeXml(params.description)}</DESCRIPTION>`
    : '';
  const hsnTag = params.hsnCode
    ? `\n          <HSNCODE>${escapeXml(params.hsnCode)}</HSNCODE>`
    : '';
  const gstApplicableTag =
    typeof params.gstRate === 'number' && params.gstRate > 0
      ? `\n          <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>`
      : '';

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>All Masters</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <UNIT NAME="${escapeXml(unit)}" ACTION="Alter">
          <NAME>${escapeXml(unit)}</NAME>
          <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
        </UNIT>
      </TALLYMESSAGE>${groupMessage}
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <STOCKITEM NAME="${escapeXml(targetAttrName)}" ACTION="${action}">
          <NAME.LIST TYPE="String">
            <NAME>${escapeXml(params.name.trim())}</NAME>${aliasLine}
          </NAME.LIST>${parentTag}
          <BASEUNITS>${escapeXml(unit)}</BASEUNITS>${partNoTag}${descTag}${hsnTag}${gstApplicableTag}
        </STOCKITEM>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Bidirectional App -> Tally Master Sync: Create or Alter a Party / Ledger in TallyPrime.
 * Uses <ID>All Masters</ID> with ACTION="Alter" (upserts cleanly without duplicate errors).
 */
export function buildLedgerMasterXml(params: LedgerMasterParams): string {
  const companyTag = params.companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(params.companyName)}</SVCURRENTCOMPANY>`
    : '';
  const targetAttrName = (params.oldName && params.oldName.trim()) ? params.oldName.trim() : params.name.trim();
  const action = params.action || 'Alter';
  const parentGroup = (params.parentGroup || 'Sundry Debtors').trim();

  const phoneTag = params.phone
    ? `\n          <LEDGERPHONE>${escapeXml(params.phone.trim())}</LEDGERPHONE>`
    : '';
  const cityTag = params.city
    ? `\n          <ADDRESS.LIST TYPE="String">\n            <ADDRESS>${escapeXml(params.city.trim())}</ADDRESS>\n          </ADDRESS.LIST>`
    : '';
  const gstinTag = params.gstin
    ? `\n          <PARTYGSTIN>${escapeXml(params.gstin.trim())}</PARTYGSTIN>`
    : '';
  const creditTag =
    typeof params.creditDays === 'number' && params.creditDays > 0
      ? `\n          <BILLCREDITPERIOD>${params.creditDays} Days</BILLCREDITPERIOD>`
      : '';
  const openingBalTag =
    typeof params.openingBalanceRupees === 'number' && params.openingBalanceRupees !== 0
      ? `\n          <OPENINGBALANCE>${(-params.openingBalanceRupees).toFixed(2)}</OPENINGBALANCE>`
      : '';

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>All Masters</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <LEDGER NAME="${escapeXml(targetAttrName)}" ACTION="${action}">
          <NAME.LIST TYPE="String">
            <NAME>${escapeXml(params.name.trim())}</NAME>
          </NAME.LIST>
          <PARENT>${escapeXml(parentGroup)}</PARENT>
          <ISBILLWISEON>Yes</ISBILLWISEON>${phoneTag}${cityTag}${gstinTag}${creditTag}${openingBalTag}
        </LEDGER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function buildStockJournalVoucherXml(params: StockAdjustmentVoucherParams): string {
  const isAddition = params.qty > 0;
  const absQty = Math.abs(params.qty);
  const amount = (absQty * params.rateRupees).toFixed(2);
  const companyTag = params.companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(params.companyName)}</SVCURRENTCOMPANY>`
    : '';
  const staticVars = `<STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}
      </STATICVARIABLES>`;

  const godown = escapeXml(params.godownName || 'Main Location');
  const remoteIdAttr = params.guid ? ` REMOTEID="${escapeXml(params.guid)}"` : '';
  const guidTag = params.guid ? `\n          <GUID>${escapeXml(params.guid)}</GUID>` : '';

  // In Tally Stock Journal:
  // INVENTORYENTRIESIN.LIST is Production/Addition
  // INVENTORYENTRIESOUT.LIST is Consumption/Reduction
  const itemBlock = isAddition
    ? `<INVENTORYENTRIESIN.LIST>
        <STOCKITEMNAME>${escapeXml(params.itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <RATE>${params.rateRupees} / ${escapeXml(params.unit)}</RATE>
        <AMOUNT>-${amount}</AMOUNT>
        <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
        <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${godown}</GODOWNNAME>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <AMOUNT>-${amount}</AMOUNT>
          <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
          <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
      </INVENTORYENTRIESIN.LIST>`
    : `<INVENTORYENTRIESOUT.LIST>
        <STOCKITEMNAME>${escapeXml(params.itemName)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${params.rateRupees} / ${escapeXml(params.unit)}</RATE>
        <AMOUNT>${amount}</AMOUNT>
        <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
        <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        <BATCHALLOCATIONS.LIST>
          <GODOWNNAME>${godown}</GODOWNNAME>
          <BATCHNAME>Primary Batch</BATCHNAME>
          <AMOUNT>${amount}</AMOUNT>
          <ACTUALQTY>${absQty} ${escapeXml(params.unit)}</ACTUALQTY>
          <BILLEDQTY>${absQty} ${escapeXml(params.unit)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>
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
      ${staticVars}
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER VCHTYPE="Stock Journal" ACTION="Create"${remoteIdAttr}>${guidTag}
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
  const isPurchase = params.voucherType === 'purchase' || params.voucherType === 'receipt_note';
  const tallyVchType =
    params.voucherType === 'sales'
      ? 'Sales'
      : params.voucherType === 'purchase'
        ? 'Purchase'
        : params.voucherType === 'receipt_note'
          ? 'Receipt Note'
          : 'Delivery Note';
  const signPrefix = isPurchase ? '-' : '';
  const partySignPrefix = isPurchase ? '' : '-';
  const defaultLedger = params.salesLedgerName || (isPurchase ? 'PURCHASE' : 'Sales');

  const companyTag = params.companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(params.companyName)}</SVCURRENTCOMPANY>`
    : '';
  const staticVars = `<STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}
      </STATICVARIABLES>`;

  const itemsTotalNum = params.items.reduce((sum, item) => sum + item.qty * item.rateRupees, 0);
  const roundOffNum = typeof params.roundOffRupees === 'number' && !isNaN(params.roundOffRupees) ? params.roundOffRupees : 0;
  const totalAmountNum = itemsTotalNum + roundOffNum;
  const totalAmount = totalAmountNum.toFixed(2);

  const roundOffEntry = roundOffNum !== 0
    ? `\n          <LEDGERENTRIES.LIST>
            <LEDGERNAME>Round Off</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${(isPurchase ? roundOffNum > 0 : roundOffNum < 0) ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${((isPurchase ? -1 : 1) * roundOffNum).toFixed(2)}</AMOUNT>
          </LEDGERENTRIES.LIST>`
    : '';

  const itemEntries = params.items
    .map((item) => {
      const amount = (item.qty * item.rateRupees).toFixed(2);
      const godown = escapeXml(item.godownName || 'Main Location');
      const itemAmount = isPurchase ? '-' + amount : amount;
      return `<ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>${isPurchase ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <RATE>${item.rateRupees} / ${escapeXml(item.unit)}</RATE>
          <AMOUNT>${itemAmount}</AMOUNT>
          <ACTUALQTY>${item.qty} ${escapeXml(item.unit)}</ACTUALQTY>
          <BILLEDQTY>${item.qty} ${escapeXml(item.unit)}</BILLEDQTY>
          <BATCHALLOCATIONS.LIST>
            <GODOWNNAME>${godown}</GODOWNNAME>
            <BATCHNAME>Primary Batch</BATCHNAME>
            <AMOUNT>${itemAmount}</AMOUNT>
            <ACTUALQTY>${item.qty} ${escapeXml(item.unit)}</ACTUALQTY>
            <BILLEDQTY>${item.qty} ${escapeXml(item.unit)}</BILLEDQTY>
          </BATCHALLOCATIONS.LIST>
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${escapeXml(defaultLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isPurchase ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <AMOUNT>${signPrefix}${amount}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`;
    })
    .join('\n');

  const vehicleNarration = params.vehicleNo
    ? `${params.narration} (Vehicle: ${params.vehicleNo})`
    : params.narration;

  const isInvoice = tallyVchType === 'Sales' || tallyVchType === 'Purchase';
  const objViewAttr = isInvoice ? ' OBJVIEW="Invoice Voucher View"' : '';
  const persistedViewTag = isInvoice ? '\n          <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>' : '';
  const isInvoiceTag = isInvoice ? '\n          <ISINVOICE>Yes</ISINVOICE>' : '\n          <ISINVOICE>No</ISINVOICE>';
  const remoteIdAttr = params.guid ? ` REMOTEID="${escapeXml(params.guid)}"` : '';
  const guidTag = params.guid ? `\n          <GUID>${escapeXml(params.guid)}</GUID>` : '';

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      ${staticVars}
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER VCHTYPE="${tallyVchType}" ACTION="Create"${objViewAttr}${remoteIdAttr}>${guidTag}
          <DATE>${params.date}</DATE>
          <VOUCHERNUMBER>${escapeXml(params.voucherNumber)}</VOUCHERNUMBER>
          <REFERENCE>${escapeXml(params.voucherNumber)}</REFERENCE>
          <BASICSHIPDELIVERYNOTE>${escapeXml(params.voucherNumber)}</BASICSHIPDELIVERYNOTE>
          <VOUCHERTYPENAME>${tallyVchType}</VOUCHERTYPENAME>${persistedViewTag}${isInvoiceTag}
          <PARTYNAME>${escapeXml(params.partyName)}</PARTYNAME>
          <PARTYLEDGERNAME>${escapeXml(params.partyName)}</PARTYLEDGERNAME>
          <BASICBUYERNAME>${escapeXml(params.partyName)}</BASICBUYERNAME>
          <NARRATION>${escapeXml(vehicleNarration)}</NARRATION>
          <LEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(params.partyName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isPurchase ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
            <AMOUNT>${partySignPrefix}${totalAmount}</AMOUNT>
          </LEDGERENTRIES.LIST>${roundOffEntry}
          ${itemEntries}
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function escapeXml(str?: string | number | null): string {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface UniversalVoucherLedgerEntry {
  ledgerName: string;
  amount: number; // in rupees
  isDeemedPositive: boolean; // true = Debit, false = Credit
  isPartyLedger?: boolean;
  billAllocations?: Array<{
    billRef: string;
    billType?: 'Agst Ref' | 'New Ref' | 'On Account' | 'Advance';
    amount: number; // in rupees
  }>;
}

export interface UniversalVoucherInventoryEntry {
  itemName: string;
  qty: number;
  unit?: string;
  rateRupees: number;
  amountRupees?: number;
  godownName?: string;
  batchName?: string;
}

export interface UniversalVoucherParams {
  voucherType: 'Sales' | 'Purchase' | 'Payment' | 'Receipt' | 'Journal' | 'Contra' | 'Credit Note' | 'Debit Note' | 'Delivery Note' | 'Receipt Note';
  date: string; // YYYYMMDD
  voucherNumber?: string;
  partyLedgerName?: string;
  narration?: string;
  companyName?: string;
  guid?: string;
  ledgerEntries: UniversalVoucherLedgerEntry[];
  inventoryEntries?: UniversalVoucherInventoryEntry[];
}

export function buildUniversalVoucherXml(params: UniversalVoucherParams): string {
  const companyTag = params.companyName
    ? `\n        <SVCURRENTCOMPANY>${escapeXml(params.companyName)}</SVCURRENTCOMPANY>`
    : '';

  const staticVars = `<STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${companyTag}
      </STATICVARIABLES>`;

  const hasInventory = Boolean(params.inventoryEntries && params.inventoryEntries.length > 0);
  const isInvoice = hasInventory || params.voucherType === 'Sales' || params.voucherType === 'Purchase';
  const objView = isInvoice ? 'Invoice Voucher View' : 'Accounting Voucher View';

  // Format ledger entries
  const ledgerEntriesXml = (params.ledgerEntries || []).map((entry) => {
    const isDebit = Boolean(entry.isDeemedPositive);
    const amountVal = Math.abs(entry.amount);
    // In Tally XML double-entry: Debit (Yes) has negative amount; Credit (No) has positive amount
    const tallyAmountStr = isDebit ? `-${amountVal.toFixed(2)}` : amountVal.toFixed(2);
    const partyTag = entry.isPartyLedger ? '\n            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : '';

    let billAllocationsXml = '';
    if (entry.billAllocations && entry.billAllocations.length > 0) {
      billAllocationsXml = entry.billAllocations.map((b) => {
        const bAmount = Math.abs(b.amount);
        const bAmountStr = isDebit ? `-${bAmount.toFixed(2)}` : bAmount.toFixed(2);
        return `\n            <BILLALLOCATIONS.LIST>
              <NAME>${escapeXml(b.billRef)}</NAME>
              <BILLTYPE>${escapeXml(b.billType || 'Agst Ref')}</BILLTYPE>
              <AMOUNT>${bAmountStr}</AMOUNT>
            </BILLALLOCATIONS.LIST>`;
      }).join('');
    }

    return `          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(entry.ledgerName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${partyTag}
            <AMOUNT>${tallyAmountStr}</AMOUNT>${billAllocationsXml}
          </ALLLEDGERENTRIES.LIST>`;
  }).join('\n');

  // Format inventory entries if present
  let inventoryEntriesXml = '';
  if (hasInventory) {
    const isPurchase = params.voucherType === 'Purchase' || params.voucherType === 'Receipt Note';
    inventoryEntriesXml = (params.inventoryEntries || []).map((inv) => {
      const lineAmt = inv.amountRupees ?? (inv.qty * inv.rateRupees);
      const absAmt = Math.abs(lineAmt).toFixed(2);
      const invAmtStr = isPurchase ? `-${absAmt}` : absAmt;
      const godown = escapeXml(inv.godownName || 'Main Location');
      const unitStr = escapeXml(inv.unit || 'pcs');

      return `          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>${escapeXml(inv.itemName)}</STOCKITEMNAME>
            <ISDEEMEDPOSITIVE>${isPurchase ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <RATE>${inv.rateRupees.toFixed(2)} / ${unitStr}</RATE>
            <AMOUNT>${invAmtStr}</AMOUNT>
            <ACTUALQTY>${inv.qty} ${unitStr}</ACTUALQTY>
            <BILLEDQTY>${inv.qty} ${unitStr}</BILLEDQTY>
            <BATCHALLOCATIONS.LIST>
              <GODOWNNAME>${godown}</GODOWNNAME>
              <BATCHNAME>${escapeXml(inv.batchName || 'Primary Batch')}</BATCHNAME>
              <AMOUNT>${invAmtStr}</AMOUNT>
              <ACTUALQTY>${inv.qty} ${unitStr}</ACTUALQTY>
              <BILLEDQTY>${inv.qty} ${unitStr}</BILLEDQTY>
            </BATCHALLOCATIONS.LIST>
          </ALLINVENTORYENTRIES.LIST>`;
    }).join('\n');
  }

  const vchNumTag = params.voucherNumber
    ? `\n          <VOUCHERNUMBER>${escapeXml(params.voucherNumber)}</VOUCHERNUMBER>`
    : '';
  const partyLedgerTag = params.partyLedgerName
    ? `\n          <PARTYLEDGERNAME>${escapeXml(params.partyLedgerName)}</PARTYLEDGERNAME>`
    : '';
  const remoteIdAttr = params.guid ? ` REMOTEID="${escapeXml(params.guid)}"` : '';
  const guidTag = params.guid ? `\n          <GUID>${escapeXml(params.guid)}</GUID>` : '';

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      ${staticVars}
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${escapeXml(params.voucherType)}" ACTION="Create" OBJVIEW="${objView}"${remoteIdAttr}>${guidTag}
          <DATE>${params.date}</DATE>
          <VOUCHERTYPENAME>${escapeXml(params.voucherType)}</VOUCHERTYPENAME>${vchNumTag}${partyLedgerTag}
          <PERSISTEDVIEW>${objView}</PERSISTEDVIEW>
          <ISINVOICE>${isInvoice ? 'Yes' : 'No'}</ISINVOICE>
          <NARRATION>${escapeXml(params.narration || '')}</NARRATION>
${ledgerEntriesXml}${inventoryEntriesXml ? '\n' + inventoryEntriesXml : ''}
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}
