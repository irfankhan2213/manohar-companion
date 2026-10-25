import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatINR, numberToIndianWords } from '@saas/shared';
import { api } from '../../api/index.js';
import { Button } from '../../components/ui/Button.js';

export const ChallanPrintScreen: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

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

  if (isLoading || !challan) {
    return (
      <div className="p-10 text-center text-label-2 text-subhead">
        Loading printable challan...
      </div>
    );
  }

  const subtotalPaise = challan.lines.reduce((acc, l) => acc + l.amount, 0);
  const isInterstate = party?.gstin?.startsWith('03') === false; // Punjab is 03
  const igstPaise = isInterstate ? Math.round(subtotalPaise * 0.18) : 0;
  const cgstPaise = !isInterstate ? Math.round(subtotalPaise * 0.09) : 0;
  const sgstPaise = !isInterstate ? Math.round(subtotalPaise * 0.09) : 0;
  const grandTotalPaise = subtotalPaise + (isInterstate ? igstPaise : cgstPaise + sgstPaise);

  const titleType =
    challan.type === 'sales'
      ? 'SALES CHALLAN'
      : challan.type === 'purchase'
      ? 'PURCHASE VOUCHER'
      : 'DELIVERY CHALLAN';

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

        <div className="flex items-center gap-3">
          <span className="text-footnote text-label-2 hidden sm:inline">
            Print preview · A4 Portrait
          </span>
          <Button
            size="small"
            onClick={() => window.print()}
            className="flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save PDF</span>
          </Button>
        </div>
      </div>

      {/* A4 Printable Canvas */}
      <div className="w-full max-w-4xl bg-white text-black p-8 rounded-2xl shadow-sm border border-separator/60 print:shadow-none print:border-none print:p-0 print:m-0 text-[13px] leading-tight font-sans">
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
              {company?.tallyName && company.tallyName !== company.name ? company.tallyName : 'Material & Goods Dispatch'}
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-center">
              {company?.gstin && <span>GSTIN: {company.gstin}</span>}
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
              <span className="text-xs">Phone: {party?.phones[0] ?? '—'}</span>
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
              {challan.lines.map((line, idx) => (
                <tr key={idx} className="text-xs">
                  <td className="py-2.5 px-2.5 border-r border-black text-center">{idx + 1}</td>
                  <td className="py-2.5 px-3 border-r border-black font-medium">
                    {line.description}
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-black text-center font-mono">
                    8452
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-black text-right font-semibold">
                    {line.qty}
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-black text-center uppercase">
                    {line.unit}
                  </td>
                  <td className="py-2.5 px-3 border-r border-black text-right font-mono">
                    {formatINR(line.rate, { symbol: false })}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold font-mono">
                    {formatINR(line.amount, { symbol: false })}
                  </td>
                </tr>
              ))}
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
                  <span className="text-gray-600">IGST (18%):</span>
                  <span className="font-mono font-semibold">
                    {formatINR(igstPaise)}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">CGST (9%):</span>
                    <span className="font-mono font-semibold">
                      {formatINR(cgstPaise)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">SGST (9%):</span>
                    <span className="font-mono font-semibold">
                      {formatINR(sgstPaise)}
                    </span>
                  </div>
                </>
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
              <p>2. Subject to Ludhiana jurisdiction only.</p>
              <p>3. This is a computer generated delivery challan.</p>
            </div>

            <div className="flex flex-col justify-between pl-2 min-h-[90px]">
              <div className="text-right font-bold">
                For MANOHAR TRADERS
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
