import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Check, FileText, Download, Loader2 } from 'lucide-react';
import { formatINR, formatRate, numberToIndianWords, getTodayIST } from '@saas/shared';
import { api } from '../../api/index.js';
import { Button } from '../../components/ui/Button.js';
import { triggerNativePrint, downloadElementAsPdf } from '../../utils/printUtils.js';

export const StatementPrintScreen: React.FC = () => {
  const { partyId = '' } = useParams<{ partyId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [detailedMode, setDetailedMode] = useState(true);
  const printRef = React.useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const { data: party, isLoading: partyLoading } = useQuery({
    queryKey: ['party', partyId],
    queryFn: () => api.parties.get(partyId),
  });

  const { data: ledger = [], isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', partyId],
    queryFn: () => api.ledger.get(partyId),
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery({
    queryKey: ['party-bills', party?.companyId, partyId],
    queryFn: () => api.bills.list(party?.companyId || 'all', partyId),
    enabled: !!party,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });
  const company = companies.find((c) => c.id === party?.companyId) || companies[0];

  // Selected bills from query param ?bills=458,459
  const rawBillsParam = searchParams.get('bills') || '';
  const selectedBillNos = useMemo(() => {
    return rawBillsParam
      ? rawBillsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  }, [rawBillsParam]);

  const toggleBillSelection = (billNo: string) => {
    let next: string[];
    if (selectedBillNos.includes(billNo)) {
      next = selectedBillNos.filter((b) => b !== billNo);
    } else {
      next = [...selectedBillNos, billNo];
    }
    if (next.length === 0) {
      searchParams.delete('bills');
    } else {
      searchParams.set('bills', next.join(','));
    }
    setSearchParams(searchParams);
  };

  const selectAllBills = () => {
    searchParams.set('bills', bills.map((b) => b.billNo).join(','));
    setSearchParams(searchParams);
  };

  const clearBillSelection = () => {
    searchParams.delete('bills');
    setSearchParams(searchParams);
  };

  if (partyLoading || ledgerLoading || billsLoading || !party) {
    return (
      <div className="p-10 text-center text-label-2 text-subhead">
        Loading customer statement & bill details...
      </div>
    );
  }

  // Filter bills if specific bill numbers are selected
  const displayBills = selectedBillNos.length > 0
    ? bills.filter((b) => selectedBillNos.includes(b.billNo))
    : bills;

  // Filter ledger lines if specific bills are selected
  const displayLedger = selectedBillNos.length > 0
    ? ledger.filter((l) => selectedBillNos.includes(l.voucherNo))
    : ledger;

  // Calculate running balances for ledger lines
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const ledgerWithBalance = displayLedger.map((line: any) => {
    running += line.debit - line.credit;
    totalDebit += line.debit;
    totalCredit += line.credit;
    return {
      ...line,
      balance: running,
    };
  });

  const closingBalance = selectedBillNos.length > 0
    ? displayBills.reduce((acc, b) => acc + (b.pending || 0), 0)
    : running;

  const todayStr = getTodayIST();
  const fyLabel = company?.financialYear || '2026-27';
  const periodStart = displayLedger[0]?.date || `01-Apr-${fyLabel.slice(0, 4)}`;
  const periodEnd = displayLedger[displayLedger.length - 1]?.date || todayStr;

  const isSpecificBillsMode = selectedBillNos.length > 0;

  const handlePrint = () => {
    triggerNativePrint(`Statement-${party?.name || 'Party'}`);
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await downloadElementAsPdf(printRef.current, `Statement-${party?.name || 'Party'}`);
    } catch (err) {
      console.error('Statement PDF export failed:', err);
      handlePrint();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg print:bg-white flex flex-col items-center py-6 px-4 print:p-0">
      {/* Top Action Toolbar (Hidden in print) */}
      <div className="w-full max-w-4xl flex flex-col gap-3 mb-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button
            variant="tinted"
            size="small"
            onClick={() => navigate(`/collections/${partyId}`)}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Customer</span>
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setDetailedMode(!detailedMode)}
              className={`text-caption px-3 py-1.5 rounded-lg font-semibold border transition-all ${
                detailedMode
                  ? 'bg-accent text-accent-contrast border-accent shadow-xs'
                  : 'bg-surface text-label-2 border-separator/40 hover:bg-fill/60'
              }`}
            >
              {detailedMode ? '✓ Detailed Items (Alt+F1)' : 'Compact View'}
            </button>

            <Button
              variant="tinted"
              size="small"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Save PDF</span>
            </Button>

            <Button
              size="small"
              onClick={handlePrint}
              className="flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </Button>
          </div>
        </div>

        {/* Bill Selection Pills Bar */}
        {bills.length > 0 && (
          <div className="p-3 bg-surface rounded-xl border border-separator/50 flex flex-col gap-2 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-caption font-semibold uppercase tracking-wider text-label-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>
                  {isSpecificBillsMode
                    ? `Printing ${selectedBillNos.length} Selected ${selectedBillNos.length === 1 ? 'Bill' : 'Bills'}`
                    : 'Showing All Statement Bills'}
                </span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearBillSelection}
                  className={`text-caption font-semibold px-2 py-0.5 rounded transition-all ${
                    !isSpecificBillsMode ? 'bg-accent text-accent-contrast' : 'text-accent hover:underline'
                  }`}
                >
                  All Statement
                </button>
                <span className="text-label-3">·</span>
                <button
                  type="button"
                  onClick={selectAllBills}
                  className="text-caption font-semibold text-accent hover:underline"
                >
                  Select All Bills
                </button>
              </div>
            </div>

            {/* Chips for each bill */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {bills.map((b) => {
                const isSelected = selectedBillNos.includes(b.billNo);
                const itemsCount = ((b as any).items || []).length;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBillSelection(b.billNo)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-semibold border transition-all ${
                      isSelected
                        ? 'bg-accent/10 border-accent text-accent shadow-xs'
                        : 'bg-fill/30 border-separator/40 text-label-2 hover:bg-fill/60'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-sm border border-label-3 inline-block" />
                    )}
                    <span>Bill #{b.billNo}</span>
                    <span className="text-label-3 tabular-nums font-mono text-[11px]">
                      ({formatINR(b.amount)})
                    </span>
                    {itemsCount > 0 && (
                      <span className="text-[10px] bg-fill px-1 rounded text-label-2 font-normal">
                        {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* A4 Printable Canvas */}
      <div
        ref={printRef}
        className="w-full max-w-4xl bg-white text-black p-8 rounded-2xl shadow-sm border border-separator/60 print:shadow-none print:border-none print:p-0 print:m-0 text-[13px] leading-tight font-sans"
      >
        {/* Document Border Box */}
        <div className="border border-black flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-black text-center flex flex-col items-center">
            <h1 className="text-2xl font-black uppercase tracking-tight">
              {company?.name || 'STATEMENT OF ACCOUNT'}
            </h1>
            <p className="text-xs text-gray-700 mt-0.5">
              {company?.tallyName && company.tallyName !== company.name
                ? company.tallyName
                : isSpecificBillsMode
                ? 'Itemized Tax Invoice & Bill Statement'
                : 'Customer Account Statement with Itemized Breakdown'}
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-center">
              {company?.gstin && <span>GSTIN: {company.gstin}</span>}
              {company?.financialYear && <span>• FY {company.financialYear}</span>}
              {company?.address && <span>• {company.address}</span>}
            </div>
          </div>

          {/* Statement Title Banner */}
          <div className="bg-gray-100 py-1.5 px-3 border-b border-black text-center font-bold tracking-wider text-sm uppercase">
            {isSpecificBillsMode
              ? `ITEMIZED BILL DETAILS & STATEMENT (${selectedBillNos.length} ${selectedBillNos.length === 1 ? 'INVOICE' : 'INVOICES'})`
              : 'STATEMENT OF ACCOUNT & RUNNING LEDGER'}
          </div>

          {/* Account Meta Grid */}
          <div className="grid grid-cols-2 divide-x divide-black border-b border-black p-3">
            <div className="flex flex-col gap-1 pr-2">
              <span className="text-[11px] font-bold uppercase text-gray-500">
                Customer / Account of:
              </span>
              <span className="font-bold text-sm">{party.name}</span>
              <span className="text-xs">{party.city}</span>
              {party.phones?.[0] && <span className="text-xs">Phone: {party.phones[0]}</span>}
              <span className="text-xs font-mono font-semibold">
                GSTIN: {party.gstin ?? 'Unregistered'}
              </span>
            </div>

            <div className="flex flex-col gap-1 pl-3 divide-y divide-gray-200">
              <div className="grid grid-cols-2 pb-1">
                <span className="text-gray-600">Period:</span>
                <span className="font-bold text-right">{periodStart} to {periodEnd}</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Financial Year:</span>
                <span className="font-bold text-right">{fyLabel}</span>
              </div>
              <div className="grid grid-cols-2 py-1">
                <span className="text-gray-600">Credit Terms:</span>
                <span className="font-semibold text-right">{party.creditDays} Days</span>
              </div>
              <div className="grid grid-cols-2 pt-1">
                <span className="text-gray-600">As on Date:</span>
                <span className="font-bold text-right">{todayStr}</span>
              </div>
            </div>
          </div>

          {/* SECTION A: DETAILED ITEM-BY-ITEM BILLS BREAKDOWN */}
          {displayBills.length > 0 && detailedMode && (
            <div className="flex flex-col divide-y divide-black border-b border-black">
              <div className="bg-gray-100 py-1 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-700">
                Itemized Goods &amp; Dispatches Breakdown
              </div>

              {displayBills.map((b, bIdx) => {
                const items = (b as any).items || [];
                const bTotal = b.amount || b.pending || 0;
                const totalPcs = items.reduce((sum: number, it: any) => sum + (it.qty || 0), 0);
                return (
                  <div key={b.id || bIdx} className="p-3 flex flex-col gap-2">
                    {/* Bill Header Info */}
                    <div className="flex items-center justify-between border-b border-gray-300 pb-1.5 flex-wrap gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm bg-black text-white px-2 py-0.5 rounded">
                          Bill #{b.billNo}
                        </span>
                        <span className="text-xs text-gray-700 font-medium">
                          Date: <strong className="text-black">{b.date}</strong> · Due: <strong className="text-black">{b.dueDate}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span>
                          Status: <strong className={b.pending === 0 ? 'text-emerald-800' : 'text-red-700'}>
                            {b.pending === 0 ? 'Fully Settled (Paid)' : `Unpaid (Pending: ${formatINR(b.pending)})`}
                          </strong>
                        </span>
                        <span className="font-bold text-sm font-mono">
                          {formatINR(bTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Items table */}
                    {items.length > 0 ? (
                      <table className="w-full border border-gray-300 text-left text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-300 font-bold text-gray-700">
                            <th className="py-1 px-2 border-r border-gray-300 w-10 text-center">#</th>
                            <th className="py-1 px-2 border-r border-gray-300">Description of Goods / Stock Item</th>
                            <th className="py-1 px-2 border-r border-gray-300 w-24 text-right">Quantity</th>
                            <th className="py-1 px-2 border-r border-gray-300 w-28 text-right">Rate (₹)</th>
                            <th className="py-1 px-2 w-32 text-right">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 font-mono">
                          {items.map((it: any, iIdx: number) => (
                            <tr key={iIdx} className="hover:bg-gray-50">
                              <td className="py-1 px-2 border-r border-gray-300 text-center text-gray-500 font-sans">
                                {iIdx + 1}
                              </td>
                              <td className="py-1 px-2 border-r border-gray-300 font-sans font-medium text-black">
                                <div>{it.item}</div>
                                {it.godown && (
                                  <div className="text-[10px] text-gray-500">Location: {it.godown}</div>
                                )}
                              </td>
                              <td className="py-1 px-2 border-r border-gray-300 text-right">
                                {it.qty} {it.unit || 'pcs'}
                              </td>
                              <td className="py-1 px-2 border-r border-gray-300 text-right">
                                {formatRate(it.rate, { symbol: false })}
                              </td>
                              <td className="py-1 px-2 text-right font-bold text-black">
                                {formatINR(it.amount, { symbol: false })}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-bold border-t border-gray-300">
                            <td colSpan={2} className="py-1 px-2 border-r border-gray-300 font-sans text-right">
                              Total ({items.length} items):
                            </td>
                            <td className="py-1 px-2 border-r border-gray-300 text-right">
                              {totalPcs > 0 ? `${totalPcs} pcs` : '—'}
                            </td>
                            <td className="py-1 px-2 border-r border-gray-300 text-right font-sans">
                              Subtotal:
                            </td>
                            <td className="py-1 px-2 text-right">
                              {formatINR(bTotal, { symbol: false })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-xs text-gray-500 italic p-1">
                        Accounting invoice entry (no individual inventory lines tracked).
                      </div>
                    )}

                    {(b as any).narration && (
                      <div className="text-[11px] text-gray-600 italic">
                        Note: {(b as any).narration}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SECTION B: LEDGER TRANSACTIONS TABLE */}
          <div className="bg-gray-100 py-1 px-3 text-[11px] font-bold uppercase tracking-wider text-gray-700 border-b border-black">
            {isSpecificBillsMode ? 'Selected Ledger Transactions' : 'Statement of Account / Running Ledger'}
          </div>

          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-xs font-bold uppercase">
                <th className="py-2 px-3 border-r border-black w-24">Date</th>
                <th className="py-2 px-3 border-r border-black">Particulars &amp; Item Details</th>
                <th className="py-2 px-2.5 border-r border-black w-32 text-center">Vch Type &amp; No</th>
                <th className="py-2 px-3 border-r border-black w-28 text-right">Debit (₹)</th>
                <th className="py-2 px-3 border-r border-black w-28 text-right">Credit (₹)</th>
                <th className="py-2 px-3 w-32 text-right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {ledgerWithBalance.map((line: any, idx) => (
                <tr key={idx} className="text-xs">
                  <td className="py-2 px-3 border-r border-black whitespace-nowrap font-mono align-top">
                    {line.date}
                  </td>
                  <td className="py-2 px-3 border-r border-black font-medium align-top">
                    <div className="font-semibold">{line.particulars}</div>
                    {/* Inline line items if not already printed in Section A */}
                    {detailedMode && (!isSpecificBillsMode || displayBills.length === 0) && line.items && line.items.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-gray-700 bg-gray-50 p-1 rounded font-normal">
                        {line.items.map((it: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span>↳ {it.item}</span>
                            <span className="font-mono text-gray-600">
                              {it.qty} {it.unit || 'pcs'} × {formatRate(it.rate)} = <strong>{formatINR(it.amount)}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {line.narration && (
                      <div className="text-[10px] text-gray-500 italic mt-0.5">
                        {line.narration}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2.5 border-r border-black text-center font-mono text-[11px] align-top">
                    {line.voucherType} #{line.voucherNo}
                  </td>
                  <td className="py-2 px-3 border-r border-black text-right font-mono font-medium align-top">
                    {line.debit > 0 ? formatINR(line.debit, { symbol: false }) : '—'}
                  </td>
                  <td className="py-2 px-3 border-r border-black text-right font-mono font-medium text-emerald-800 align-top">
                    {line.credit > 0 ? formatINR(line.credit, { symbol: false }) : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold align-top">
                    {formatINR(line.balance, { drCr: true })}
                  </td>
                </tr>
              ))}
              {/* Fill rows if empty */}
              {Array.from({ length: Math.max(0, 3 - ledgerWithBalance.length) }).map((_, i) => (
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
                  {isSpecificBillsMode ? 'Net Selected Invoices Amount in Words:' : 'Closing Balance in Words:'}
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
                <span>{isSpecificBillsMode ? 'Pending Balance:' : 'Closing Balance:'}</span>
                <span className="font-mono text-base">
                  {formatINR(closingBalance, { drCr: true })}
                </span>
              </div>
            </div>
          </div>

          {/* Notes & Signature */}
          <div className="border-t border-black grid grid-cols-2 divide-x divide-black p-3 text-xs">
            <div className="flex flex-col gap-1 pr-2 justify-end">
              <span className="text-[11px] text-gray-500 italic">
                * This is a computer-generated statement of accounts.
              </span>
            </div>

            <div className="flex flex-col justify-between pl-3 min-h-[90px]">
              <div className="text-right font-bold text-xs uppercase">
                For {company?.name || 'MANOHAR TRADERS'}
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
