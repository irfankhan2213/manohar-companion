import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import { formatINR, numberToIndianWords } from '@saas/shared';
import { api } from '../../api/index.js';
import { Button } from '../../components/ui/Button.js';

export const ChallanPrintScreen: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = React.useRef<HTMLDivElement>(null);

  const { data: challan, isLoading } = useQuery({
    queryKey: ['challan', id],
    queryFn: () => api.challans.get(id),
  });

  const { data: party } = useQuery({
    queryKey: ['party', challan?.partyId],
    queryFn: () => (challan ? api.parties.get(challan.partyId) : null),
    enabled: !!challan,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const company = companies.find((c) => c.id === challan?.companyId) || companies[0];

  const { data: stockItems = [] } = useQuery({
    queryKey: ['stock-items', challan?.companyId || 'all'],
    queryFn: () => api.stock.items.list(challan?.companyId || 'all'),
    enabled: !!challan,
  });
  const stockMap = new Map(stockItems.map((s) => [s.id, s]));

  if (isLoading || !challan) {
    return (
      <div className="p-10 text-center text-label-2 text-subhead">
        Loading printable challan...
      </div>
    );
  }

  const getLineGstRate = (line: typeof challan.lines[0]) =>
    line.gstRate ?? stockMap.get(line.itemId)?.gstRate ?? 18;
  const getLineHsn = (line: typeof challan.lines[0]) =>
    line.hsnCode || stockMap.get(line.itemId)?.hsnCode || '8452';
  const getLineAmount = (line: typeof challan.lines[0]) =>
    typeof line.amount === 'number' && line.amount > 0 ? line.amount : Math.round((line.qty || 1) * (line.rate || 0));

  const subtotalPaise = challan.lines.reduce((acc, l) => acc + getLineAmount(l), 0);
  const totalGstPaise = challan.lines.reduce(
    (acc, l) => acc + Math.round(getLineAmount(l) * (getLineGstRate(l) / 100)),
    0
  );
  const uniqueRates = Array.from(new Set(challan.lines.map((l) => getLineGstRate(l))));
  const effectiveGstLabel =
    uniqueRates.length === 1 ? `${uniqueRates[0]}%` : 'As per HSN';
  const halfGstLabel =
    uniqueRates.length === 1 ? `${uniqueRates[0]! / 2}%` : '50%';

  const companyStateCode = company?.gstin && company.gstin.length >= 2 ? company.gstin.slice(0, 2) : '03';
  const partyStateCode = party?.gstin && party.gstin.length >= 2 ? party.gstin.slice(0, 2) : companyStateCode;
  const isInterstate = partyStateCode !== companyStateCode;
  const igstPaise = isInterstate ? totalGstPaise : 0;
  const cgstPaise = !isInterstate ? Math.round(totalGstPaise / 2) : 0;
  const sgstPaise = !isInterstate ? totalGstPaise - cgstPaise : 0;
  const rawGrandTotalPaise = subtotalPaise + (isInterstate ? igstPaise : cgstPaise + sgstPaise);

  // Commercial nearest-rupee Round-Off (standard Tally and GST format)
  const roundOffPaise = typeof (challan as any).roundOff === 'number' && (challan as any).roundOff !== 0
    ? (challan as any).roundOff
    : (Math.round(rawGrandTotalPaise / 100) * 100 - rawGrandTotalPaise);
  const grandTotalPaise = rawGrandTotalPaise + roundOffPaise;

  const titleType =
    challan.type === 'sales'
      ? 'SALES CHALLAN'
      : challan.type === 'purchase'
      ? 'PURCHASE VOUCHER'
      : 'DELIVERY CHALLAN';

  // Standalone A4 PDF generator that prints cleanly without any app navigation or mobile layout chrome
  const handlePrintOrDownloadPdf = () => {
    const safeFileName = `${challan.number.replace(/[^a-zA-Z0-9-_]/g, '-')}-${challan.date}`;
    const originalTitle = document.title;
    document.title = safeFileName;

    if (printRef.current) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        const styleLinks = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map((el) => el.outerHTML)
          .join('\n');
        doc.open();
        doc.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safeFileName}</title>
    ${styleLinks}
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      html, body { background: #fff !important; color: #000 !important; margin: 0 !important; padding: 0 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    </style>
  </head>
  <body>
    ${printRef.current.outerHTML}
  </body>
</html>`);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.title = originalTitle;
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }, 250);
        return;
      }
    }

    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  };

  return (
    <div className="min-h-screen bg-bg print:bg-white flex flex-col items-center py-6 px-4 print:p-0">
      {/* Top Action Toolbar (Hidden in print) */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-4 no-print">
        <Button
          variant="tinted"
          size="small"
          onClick={() => navigate(`/challans/${challan.id}`)}
          className="flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Challan</span>
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-footnote text-label-2 hidden sm:inline">
            A4 Portrait · {challan.number}
          </span>
          <Button
            variant="tinted"
            size="small"
            onClick={handlePrintOrDownloadPdf}
            className="flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Save PDF</span>
          </Button>
          <Button
            size="small"
            onClick={handlePrintOrDownloadPdf}
            className="flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </Button>
        </div>
      </div>

      {/* A4 Printable Canvas */}
      <div
        ref={printRef}
        id="challan-print-sheet"
        className="w-full max-w-4xl bg-white text-black p-8 rounded-2xl shadow-sm border border-separator/60 print:shadow-none print:border-none print:p-0 print:m-0 text-[13px] leading-tight font-sans"
      >
        {/* Document Header */}
        <div className="border border-black flex flex-col">
          {/* Company Banner */}
          <div className="p-4 border-b border-black text-center flex flex-col items-center">
            <span className="text-[11px] font-bold tracking-wider uppercase text-gray-600 mb-0.5">
              Issued under Rule 55 of CGST Rules, 2017
            </span>
            <h1 className="text-2xl font-black uppercase tracking-tight">
              {company?.name || 'DELIVERY CHALLAN'}
            </h1>
            <p className="text-xs text-gray-700 mt-0.5">
              {company?.address ||
                (company?.tallyName && company.tallyName !== company.name
                  ? company.tallyName
                  : 'Material & Goods Dispatch')}
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-center">
              {company?.gstin && <span>GSTIN: {company.gstin}</span>}
              {company?.phone && <span>• Ph: {company.phone}</span>}
              {company?.financialYear && <span>• FY {company.financialYear}</span>}
            </div>
          </div>

          {/* Title Bar */}
          <div className="bg-gray-100 py-1.5 px-3 border-b border-black text-center font-bold tracking-wider text-sm uppercase">
            {titleType}
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 divide-x divide-black border-b border-black">
            {/* Left: Consignee / Buyer */}
            <div className="p-3 flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase text-gray-500">
                Consignee / Dispatched To:
              </span>
              <span className="font-bold text-sm">{party?.name ?? '—'}</span>
              <span className="text-xs">{party?.city ?? '—'}</span>
              <span className="text-xs">Phone: {party?.phones?.[0] ?? '—'}</span>
              <span className="text-xs font-mono font-semibold">
                GSTIN: {party?.gstin ?? 'Unregistered'}
              </span>
            </div>

            {/* Right: Challan & Transport Details */}
            <div className="p-3 flex flex-col gap-1 divide-y divide-gray-200">
              <div className="grid grid-cols-2 pb-1">
                <span className="text-gray-600">Challan No:</span>
                <span className="font-bold text-right font-mono">{challan.number}</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Date:</span>
                <span className="font-bold text-right">{challan.date}</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Vehicle No:</span>
                <span className="font-bold text-right font-mono uppercase">
                  {challan.vehicleNo || 'Self Pick-up'}
                </span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Transporter:</span>
                <span className="font-semibold text-right">
                  {challan.transporter || '—'}
                </span>
              </div>
              <div className="grid grid-cols-2 pt-1">
                <span className="text-gray-600">LR / Bilty No:</span>
                <span className="font-semibold text-right font-mono">
                  {challan.lrNo || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-xs font-bold uppercase">
                <th className="py-2 px-2.5 border-r border-black w-10 text-center">S.N.</th>
                <th className="py-2 px-3 border-r border-black">Description of Goods</th>
                <th className="py-2 px-2.5 border-r border-black w-24 text-center">HSN/SAC</th>
                <th className="py-2 px-2.5 border-r border-black w-20 text-right">Qty</th>
                <th className="py-2 px-2.5 border-r border-black w-16 text-center">Unit</th>
                <th className="py-2 px-3 border-r border-black w-24 text-right">Rate (₹)</th>
                <th className="py-2 px-3 w-28 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {challan.lines.map((line, idx) => {
                const lineAmt = getLineAmount(line);
                return (
                  <tr key={idx} className="text-xs">
                    <td className="py-2.5 px-2.5 border-r border-black text-center">{idx + 1}</td>
                    <td className="py-2.5 px-3 border-r border-black font-medium">
                      <div>{line.description}</div>
                      <div className="text-[10px] text-gray-500 font-mono">GST {getLineGstRate(line)}%</div>
                    </td>
                    <td className="py-2.5 px-2.5 border-r border-black text-center font-mono">
                      {getLineHsn(line)}
                    </td>
                    <td className="py-2.5 px-2.5 border-r border-black text-right font-semibold">
                      {line.qty}
                    </td>
                    <td className="py-2.5 px-2.5 border-r border-black text-center uppercase">
                      {line.unit || 'pcs'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-black text-right font-mono">
                      {formatINR(line.rate || 0, { symbol: false })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold font-mono">
                      {formatINR(lineAmt, { symbol: false })}
                    </td>
                  </tr>
                );
              })}
              {/* Fill remaining empty rows to keep uniform height */}
              {Array.from({ length: Math.max(0, 4 - challan.lines.length) }).map((_, i) => (
                <tr key={`empty-${i}`} className="text-xs h-8">
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td className="border-r border-black"></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Section */}
          <div className="border-t border-black grid grid-cols-2 divide-x divide-black">
            {/* Left: Amount in Words & Remarks */}
            <div className="p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-gray-500 block mb-1">
                  Amount in Words:
                </span>
                <span className="font-semibold text-xs italic">
                  {numberToIndianWords(grandTotalPaise)}
                </span>
              </div>
              {challan.narration && (
                <div className="mt-3 text-xs text-gray-600">
                  <span className="font-semibold">Note:</span> {challan.narration}
                </div>
              )}
            </div>

            {/* Right: Financial Breakdown */}
            <div className="p-3 flex flex-col divide-y divide-gray-200">
              <div className="flex justify-between py-1">
                <span className="text-gray-600">Taxable Value:</span>
                <span className="font-mono font-semibold">
                  {formatINR(subtotalPaise)}
                </span>
              </div>
              {isInterstate ? (
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">IGST ({effectiveGstLabel}):</span>
                  <span className="font-mono font-semibold">
                    {formatINR(igstPaise)}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">CGST ({halfGstLabel}):</span>
                    <span className="font-mono font-semibold">
                      {formatINR(cgstPaise)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">SGST ({halfGstLabel}):</span>
                    <span className="font-mono font-semibold">
                      {formatINR(sgstPaise)}
                    </span>
                  </div>
                </>
              )}
              {roundOffPaise !== 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Round Off:</span>
                  <span className="font-mono font-semibold">
                    {roundOffPaise > 0
                      ? `(+) ${formatINR(roundOffPaise)}`
                      : `(-) ${formatINR(Math.abs(roundOffPaise))}`}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 font-bold text-sm">
                <span>Grand Total:</span>
                <span className="font-mono">{formatINR(grandTotalPaise)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Signatures */}
          <div className="border-t border-black grid grid-cols-2 divide-x divide-black p-3 text-xs">
            <div className="flex flex-col gap-1 pr-2">
              <span className="font-bold uppercase text-[11px] text-gray-600">
                Terms & Conditions:
              </span>
              <p>1. Goods received in sound condition and complete count.</p>
              <p>2. Subject to local jurisdiction only.</p>
              <p>3. This is a computer generated challan.</p>
            </div>

            <div className="flex flex-col justify-between pl-2 min-h-[90px]">
              <div className="text-right font-bold uppercase">
                For {company?.name || 'MANOHAR TRADERS'}
              </div>
              <div className="flex justify-between items-end text-[11px] text-gray-500 pt-8">
                <span>Receiver's Signature</span>
                <span>Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
