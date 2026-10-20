export function getMockCompanyInfoXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <STATUS>1</STATUS>
  </HEADER>
  <BODY>
    <DATA>
      <COMPANYNAME>Manohar Traders</COMPANYNAME>
      <COMPNAMEFIELD>Manohar Traders</COMPNAMEFIELD>
      <COMPYEARFIELD>20260401</COMPYEARFIELD>
      <COMPBOOKSFIELD>20260401</COMPBOOKSFIELD>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function getMockLedgersXml(lastAlterId: number = 0): string {
  const allLedgers = [
    {
      name: 'Sample Garments Pvt Ltd',
      parent: 'Sundry Debtors',
      opening: '105840.00 Dr',
      closing: '105840.00 Dr',
      phone: '+91 98390 12345',
      email: 'accounts@samplegarments.com',
      gstin: '09AABCS1234F1Z3',
      creditPeriod: '30',
      alterId: 1475,
    },
    {
      name: 'Bharat Textiles',
      parent: 'Sundry Debtors',
      opening: '245000.00 Dr',
      closing: '245000.00 Dr',
      phone: '+91 98141 55667',
      email: 'info@bharattextiles.in',
      gstin: '03AABCB5678G1Z4',
      creditPeriod: '45',
      alterId: 1478,
    },
    {
      name: 'Royal Fashion Hub',
      parent: 'Sundry Debtors',
      opening: '88500.00 Dr',
      closing: '88500.00 Dr',
      phone: '+91 98722 88990',
      email: 'royal@fashionhub.com',
      gstin: '03AAACR9912H1Z8',
      creditPeriod: '30',
      alterId: 1480,
    },
    {
      name: 'Apex Stitching Co',
      parent: 'Sundry Debtors',
      opening: '42300.00 Dr',
      closing: '42300.00 Dr',
      phone: '+91 98555 44332',
      email: 'purchase@apexstitching.com',
      gstin: '03AABCA9012J1Z2',
      creditPeriod: '30',
      alterId: 1472,
    },
    {
      name: 'Golden Yarns & Fibres',
      parent: 'Sundry Creditors',
      opening: '350000.00 Cr',
      closing: '350000.00 Cr',
      phone: '+91 98111 22334',
      email: 'sales@goldenyarns.com',
      gstin: '07AABCG4455K1Z9',
      creditPeriod: '60',
      alterId: 1468,
    },
  ];

  const filtered = allLedgers.filter((l) => l.alterId > lastAlterId);

  const ledgersXml = filtered
    .map(
      (l) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <LEDGER NAME="${l.name}">
        <NAME>${l.name}</NAME>
        <PARENT>${l.parent}</PARENT>
        <OPENINGBALANCE>${l.opening}</OPENINGBALANCE>
        <CLOSINGBALANCE>${l.closing}</CLOSINGBALANCE>
        <LEDGERPHONE>${l.phone}</LEDGERPHONE>
        <EMAIL>${l.email}</EMAIL>
        <PARTYGSTIN>${l.gstin}</PARTYGSTIN>
        <BILLCREDITPERIOD>${l.creditPeriod}</BILLCREDITPERIOD>
        <ALTERID>${l.alterId}</ALTERID>
      </LEDGER>
    </TALLYMESSAGE>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <STATUS>1</STATUS>
  </HEADER>
  <BODY>
    <DATA>
      ${ledgersXml}
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function getMockBillsXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <STATUS>1</STATUS>
  </HEADER>
  <BODY>
    <DATA>
      <TALLYMESSAGE>
        <BILLS>
          <PARENT>Sample Garments Pvt Ltd</PARENT>
          <BILLREF>GST/004/26-27</BILLREF>
          <BILLDATE>20260910</BILLDATE>
          <BILLDUE>20261010</BILLDUE>
          <CLOSINGBALANCE>105840.00 Dr</CLOSINGBALANCE>
          <ISDEBIT>Yes</ISDEBIT>
        </BILLS>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <BILLS>
          <PARENT>Bharat Textiles</PARENT>
          <BILLREF>INV/142/26-27</BILLREF>
          <BILLDATE>20260815</BILLDATE>
          <BILLDUE>20260929</BILLDUE>
          <CLOSINGBALANCE>245000.00 Dr</CLOSINGBALANCE>
          <ISDEBIT>Yes</ISDEBIT>
        </BILLS>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <BILLS>
          <PARENT>Royal Fashion Hub</PARENT>
          <BILLREF>INV/188/26-27</BILLREF>
          <BILLDATE>20260905</BILLDATE>
          <BILLDUE>20261005</BILLDUE>
          <CLOSINGBALANCE>88500.00 Dr</CLOSINGBALANCE>
          <ISDEBIT>Yes</ISDEBIT>
        </BILLS>
      </TALLYMESSAGE>
      <TALLYMESSAGE>
        <BILLS>
          <PARENT>Apex Stitching Co</PARENT>
          <BILLREF>INV/195/26-27</BILLREF>
          <BILLDATE>20260920</BILLDATE>
          <BILLDUE>20261020</BILLDUE>
          <CLOSINGBALANCE>42300.00 Dr</CLOSINGBALANCE>
          <ISDEBIT>Yes</ISDEBIT>
        </BILLS>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function getMockStockItemsXml(lastAlterId: number = 0): string {
  const allItems = [
    {
      name: 'Servo Motor 550W (Direct Drive)',
      parent: 'Industrial Motors',
      partNo: 'SM-550-DD',
      closingQty: 18,
      baseUnits: 'pcs',
      closingRate: 4200,
      closingValue: 75600,
      alterId: 1476,
    },
    {
      name: 'Rotary Hook Assembly (Japanese Type)',
      parent: 'Sewing Accessories',
      partNo: 'RH-220-JP',
      closingQty: 84,
      baseUnits: 'set',
      closingRate: 850,
      closingValue: 71400,
      alterId: 1479,
    },
    {
      name: 'Heavy Duty Needle Plate B-24',
      parent: 'Sewing Accessories',
      partNo: 'NP-B24-HD',
      closingQty: 145,
      baseUnits: 'pcs',
      closingRate: 180,
      closingValue: 26100,
      alterId: 1465,
    },
    {
      name: 'Standard Bobbin Case (Lockstitch)',
      parent: 'Sewing Accessories',
      partNo: 'BC-LK-01',
      closingQty: 320,
      baseUnits: 'pcs',
      closingRate: 95,
      closingValue: 30400,
      alterId: 1470,
    },
  ];

  const filtered = allItems.filter((i) => i.alterId > lastAlterId);

  const itemsXml = filtered
    .map(
      (i) => `
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <STOCKITEM NAME="${i.name}">
        <NAME>${i.name}</NAME>
        <PARENT>${i.parent}</PARENT>
        <PARTNO>${i.partNo}</PARTNO>
        <CLOSINGBALANCE>${i.closingQty} ${i.baseUnits}</CLOSINGBALANCE>
        <CLOSINGRATE>${i.closingRate} / ${i.baseUnits}</CLOSINGRATE>
        <CLOSINGVALUE>${i.closingValue}</CLOSINGVALUE>
        <BASEUNITS>${i.baseUnits}</BASEUNITS>
        <ALTERID>${i.alterId}</ALTERID>
      </STOCKITEM>
    </TALLYMESSAGE>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <STATUS>1</STATUS>
  </HEADER>
  <BODY>
    <DATA>
      ${itemsXml}
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function getMockVoucherImportResponseXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<RESPONSE>
  <CREATED>1</CREATED>
  <ALTERED>0</ALTERED>
  <DELETED>0</DELETED>
  <LASTVCHID>98124</LASTVCHID>
  <LASTMID>1481</LASTMID>
  <COMBINED>0</COMBINED>
  <IGNORED>0</IGNORED>
  <ERRORS>0</ERRORS>
</RESPONSE>`;
}
