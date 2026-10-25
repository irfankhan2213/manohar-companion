import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { formatINR, numberToIndianWords } from '@saas/shared';
import { api } from '../../api/index.js';
import { Button } from '../../components/ui/Button.js';

export const StatementPrintScreen: React.FC = () => {
  const { partyId = '' } = useParams<{ partyId: string }>();
  const navigate = useNavigate();

  const { data: party, isLoading: partyLoading } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => api.parties.get(partyId),
  });

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', partyId],
    queryFn: () => api.ledger.get(partyId),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const company = companies.find((c) => c.id === party?.companyId) || companies[0];

  if (partyLoading || ledgerLoading || !party) {
    return (
      <div className="p-10 text-center text-label-2 text-subhead">
        Loading customer statement...
      </div>
    );
  }

  // Calculate running balances
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const ledgerWithBalance = ledger.map((line) => {
    running += line.debit - line.credit;
    totalDebit += line.debit;
    totalCredit += line.credit;
    return {
      ...line,
      balance: running,
    };
  });

  const closingBalance = running;

  return (
    <div className="min-h-screen bg-bg print:bg-white flex flex-col items-center py-6 px-4 print:p-0">
      {/* Top Action Toolbar (Hidden in print) */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-4 no-print">
        <Button
          variant="tinted"
          size="small"
          onClick={() => navigate(`/collections/${partyId}`)}
          className="flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Customer</span>
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-footnote text-label-2 hidden sm:inline">
            A4 Statement · Official Tally Ledger
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
        {/* Document Border Box */}
        <div className="border border-black flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-black text-center flex flex-col items-center">
            <h1 className="text-2xl font-black uppercase tracking-tight">
              {company?.name || 'STATEMENT OF ACCOUNT'}
            </h1>
            <p className="text-xs text-gray-700 mt-0.5">
              {company?.tallyName && company.tallyName !== company.name ? company.tallyName : 'Customer Account Statement'}
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-center">
              {company?.gstin && <span>GSTIN: {company.gstin}</span>}
              {company?.financialYear && <span>• FY {company.financialYear}</span>}
            </div>
          </div>

          {/* Statement Banner */}
          <div className="bg-gray-100 py-1.5 px-3 border-b border-black text-center font-bold tracking-wider text-sm uppercase">
            STATEMENT OF ACCOUNT
          </div>

          {/* Account Meta Grid */}
          <div className="grid grid-cols-2 divide-x divide-black border-b border-black p-3">
            <div className="flex flex-col gap-1 pr-2">
              <span className="text-[11px] font-bold uppercase text-gray-500">
                Account of:
              </span>
              <span className="font-bold text-sm">{party.name}</span>
              <span className="text-xs">{party.city}</span>
              <span className="text-xs">Phone: {party.phones[0]}</span>
              <span className="text-xs font-mono font-semibold">
                GSTIN: {party.gstin ?? 'Unregistered'}
              </span>
            </div>

            <div className="flex flex-col gap-1 pl-3 divide-y divide-gray-200">
              <div className="grid grid-cols-2 pb-1">
                <span className="text-gray-600">Period:</span>
                <span className="font-bold text-right">01-Apr-2026 to 17-Oct-2026</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Financial Year:</span>
                <span className="font-bold text-right">2026-27</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Credit Terms:</span>
                <span className="font-semibold text-right">{party.creditDays} Days</span>
              </div>
              <div className="grid grid-cols-2 pt-1">
                <span className="text-gray-600">As on Date:</span>
                <span className="font-bold text-right">17-Oct-2026</span>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-xs font-bold uppercase">
                <th className="py-2 px-3 border-r border-black w-24">Date</th>
                <th className="py-2 px-3 border-r border-black">Particulars</th>
                <th className="py-2 px-2.5 border-r border-black w-28 text-center">Vch Type & No</th>
                <th className="py-2 px-3 border-r border-black w-28 text-right">Debit (₹)</th>
                <th className="py-2 px-3 border-r border-black w-28 text-right">Credit (₹)</th>
                <th className="py-2 px-3 w-32 text-right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {ledgerWithBalance.map((line, idx) => (
                <tr key={idx} className="text-xs">
                  <td className="py-2 px-3 border-r border-black whitespace-nowrap font-mono">
                    {line.date}
                  </td>
                  <td className="py-2 px-3 border-r border-black font-medium">
                    {line.particulars}
                  </td>
                  <td className="py-2 px-2.5 border-r border-black text-center font-mono text-[11px]">
                    {line.voucherType} #{line.voucherNo}
                  </td>
                  <td className="py-2 px-3 border-r border-black text-right font-mono font-medium">
                    {line.debit > 0 ? formatINR(line.debit, { symbol: false }) : '—'}
                  </td>
                  <td className="py-2 px-3 border-r border-black text-right font-mono font-medium text-emerald-800">
                    {line.credit > 0 ? formatINR(line.credit, { symbol: false }) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold">
                    {formatINR(line.balance, { drCr: true })}
                  </td>
                </tr>
              ))}
              {/* Fill rows */}
              {Array.from({ length: Math.max(0, 5 - ledgerWithBalance.length) }).map((_, i) => (
                <tr key={`empty-${i}`} className="text-xs h-7">
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

          {/* Totals & Closing Balance */}
          <div className="border-t border-black grid grid-cols-2 divide-x divide-black">
            {/* Left: Balance in Words */}
            <div className="p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-gray-500 block mb-1">
                  Closing Balance in Words:
                </span>
                <span className="font-semibold text-xs italic">
                  {numberToIndianWords(closingBalance)} ({closingBalance >= 0 ? 'Debit' : 'Credit'})
                </span>
              </div>
              <div className="mt-3 text-[11px] text-gray-600">
                Please verify this statement with your books and notify us of any discrepancy within 7 days.
              </div>
            </div>

            {/* Right: Debit/Credit Totals */}
            <div className="p-3 flex flex-col divide-y divide-gray-200">
              <div className="flex justify-between py-1 text-xs">
                <span className="text-gray-600">Total Debits:</span>
                <span className="font-mono font-semibold">
                  {formatINR(totalDebit)}
                </span>
              </div>
              <div className="flex justify-between py-1 text-xs">
                <span className="text-gray-600">Total Credits:</span>
                <span className="font-mono font-semibold text-emerald-800">
                  {formatINR(totalCredit)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 font-bold text-sm bg-gray-50 -mx-3 px-3">
                <span>Closing Balance:</span>
                <span className="font-mono text-base">
                  {formatINR(closingBalance, { drCr: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Bank Details & Signature */}
          <div className="border-t border-black grid grid-cols-2 divide-x divide-black p-3 text-xs">
            <div className="flex flex-col gap-1 pr-2">
              <span className="font-bold uppercase text-[11px] text-gray-600 mb-0.5">
                Bank Details for NEFT / RTGS:
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <span className="text-gray-600">Bank:</span>
                <span className="col-span-2 font-semibold">HDFC Bank Ltd</span>
                <span className="text-gray-600">A/C Name:</span>
                <span className="col-span-2 font-semibold">Manohar Traders</span>
                <span className="text-gray-600">A/C No:</span>
                <span className="col-span-2 font-mono font-bold">50200012345678</span>
                <span className="text-gray-600">IFSC Code:</span>
                <span className="col-span-2 font-mono font-semibold">HDFC0001234</span>
                <span className="text-gray-600">Branch:</span>
                <span className="col-span-2">Industrial Area, Ludhiana</span>
              </div>
            </div>

            <div className="flex flex-col justify-between pl-3 min-h-[90px]">
              <div className="text-right font-bold text-xs">
                For MANOHAR TRADERS
              </div>
              <div className="flex justify-between items-end text-[11px] text-gray-500 pt-8">
                <span>Accounts Department</span>
                <span>Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
