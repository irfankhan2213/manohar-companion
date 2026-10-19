import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Printer,
  Share2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { formatINR, numberToIndianWords } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';

export const ChallanDetailScreen: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  const { data: challan, isLoading } = useQuery({
    queryKey: ['challan', id],
    queryFn: () => api.challans.get(id),
    refetchInterval: (query) => {
      // Auto-poll if queued
      return query.state.data?.status === 'queued' ? 1500 : false;
    },
  });

  const { data: party } = useQuery({
    queryKey: ['party', challan?.partyId],
    queryFn: () => (challan ? api.parties.get(challan.partyId) : null),
    enabled: !!challan,
  });

  const { data: godowns = [] } = useQuery({
    queryKey: ['godowns', currentCompanyId],
    queryFn: () => api.godowns.list(currentCompanyId),
  });

  const retryMutation = useMutation({
    mutationFn: () => api.challans.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challan', id] });
      queryClient.invalidateQueries({ queryKey: ['challans'] });
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      showToast({ message: 'Challan sync retried' });
    },
  });

  if (isLoading) {
    return (
      <LargeTitleScreen title="Challan Details">
        <div className="p-8 text-center text-label-2 text-subhead">
          Loading challan details...
        </div>
      </LargeTitleScreen>
    );
  }

  if (!challan) {
    return (
      <LargeTitleScreen title="Challan Details">
        <div className="p-8 text-center text-label-2 text-subhead flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-danger" />
          <span>Challan not found</span>
          <Button variant="tinted" size="small" onClick={() => navigate('/challans')}>
            Back to Challans
          </Button>
        </div>
      </LargeTitleScreen>
    );
  }

  const subtotalPaise = challan.lines.reduce((acc, l) => acc + l.amount, 0);
  const gstPaise = Math.round(subtotalPaise * 0.18);
  const grandTotalPaise = subtotalPaise + gstPaise;
  const godownName = godowns.find((g) => g.id === challan.godownId)?.name ?? 'Main Godown (Ludhiana)';

  const handleShareWhatsApp = () => {
    const phone = party?.phones[0]?.replace(/\D/g, '') || '';
    const text = encodeURIComponent(
      `Hello ${party?.name ?? 'Customer'}, your ${challan.type.toUpperCase()} CHALLAN ${challan.number} dated ${challan.date} for ${formatINR(grandTotalPaise)} has been generated.` +
      (challan.vehicleNo ? ` Vehicle: ${challan.vehicleNo}.` : '') +
      ` Dispatched from Manohar Traders.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <LargeTitleScreen
      title={challan.number}
      headerAction={
        <button
          type="button"
          onClick={() => navigate('/challans')}
          className="text-subhead font-semibold text-accent hover:opacity-80"
        >
          Done
        </button>
      }
    >
      {/* Status Hero Card */}
      <div className="bg-surface rounded-ios-card p-4 border border-separator/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {challan.status === 'synced' && (
              <CheckCircle2 className="w-5 h-5 text-ok" />
            )}
            {challan.status === 'queued' && (
              <Clock className="w-5 h-5 text-warn animate-spin" />
            )}
            {challan.status === 'failed' && (
              <AlertCircle className="w-5 h-5 text-danger" />
            )}
            {challan.status === 'draft' && (
              <FileText className="w-5 h-5 text-label-2" />
            )}
            <span className="text-headline font-bold text-label capitalize">
              {challan.type} Challan
            </span>
          </div>

          <div>
            {challan.status === 'synced' && (
              <StatusText text="Updated in Tally" variant="ok" />
            )}
            {challan.status === 'queued' && (
              <StatusText text="Waiting for Tally" variant="warn" />
            )}
            {challan.status === 'failed' && (
              <StatusText text="Couldn't update" variant="danger" />
            )}
            {challan.status === 'draft' && (
              <StatusText text="Draft" variant="neutral" />
            )}
          </div>
        </div>

        {challan.status === 'queued' && (
          <p className="text-footnote text-label-2 bg-fill/40 p-2.5 rounded-xl">
            This voucher has been written to the offline queue and will sync to TallyPrime on the office PC.
          </p>
        )}

        {challan.status === 'failed' && (
          <div className="flex flex-col gap-2 bg-danger/10 p-3 rounded-xl">
            <span className="text-footnote font-medium text-danger">
              Sync Error: {challan.failureReason ?? 'Tally connection timeout.'}
            </span>
            <Button
              variant="tinted"
              size="small"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
              className="self-start"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              <span>Retry Sync</span>
            </Button>
          </div>
        )}

        {challan.status === 'synced' && (
          <span className="text-caption text-label-2">
            Verified in TallyPrime · Master AlterID #1480
          </span>
        )}
      </div>

      {/* Primary Actions: Print & Share */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="primary"
          onClick={() => navigate(`/print/challan/${challan.id}`)}
          className="h-11 flex items-center justify-center gap-2"
        >
          <Printer className="w-4 h-4" />
          <span>View / Print PDF</span>
        </Button>

        <Button
          variant="tinted"
          onClick={handleShareWhatsApp}
          className="h-11 flex items-center justify-center gap-2 text-[#1B5E20] border-[#C5E1A5] bg-[#E8F5E9]"
        >
          <Share2 className="w-4 h-4" />
          <span>Share WhatsApp</span>
        </Button>
      </div>

      {/* Consignee / Party Details */}
      <InsetGroup title="Consignee / Party">
        <Row
          title="Party Name"
          trailing={<span className="font-semibold text-label">{party?.name ?? '—'}</span>}
        />
        <Row
          title="City / Station"
          trailing={<span className="text-label">{party?.city ?? '—'}</span>}
        />
        <Row
          title="Phone"
          trailing={<span className="text-label">{party?.phones[0] ?? '—'}</span>}
        />
        {party?.gstin && (
          <Row
            title="GSTIN"
            trailing={<span className="font-mono text-label">{party.gstin}</span>}
          />
        )}
      </InsetGroup>

      {/* Dispatch & Transport */}
      <InsetGroup title="Dispatch & Transport">
        <Row
          title="Challan Date"
          trailing={<span className="font-semibold text-label">{challan.date}</span>}
        />
        <Row
          title="Source Godown"
          trailing={<span className="text-label">{godownName}</span>}
        />
        {challan.vehicleNo && (
          <Row
            title="Vehicle Number"
            trailing={
              <span className="font-mono font-bold text-label">
                {challan.vehicleNo}
              </span>
            }
          />
        )}
        {challan.lrNo && (
          <Row
            title="LR / Bilty Number"
            trailing={<span className="font-semibold text-label">{challan.lrNo}</span>}
          />
        )}
        {challan.transporter && (
          <Row
            title="Transporter"
            trailing={<span className="text-label">{challan.transporter}</span>}
          />
        )}
        {challan.narration && (
          <Row
            title="Remarks"
            subtitle={challan.narration}
          />
        )}
      </InsetGroup>

      {/* Items Breakdown */}
      <InsetGroup title={`Items Dispatched (${challan.lines.length})`}>
        {challan.lines.map((line, idx) => (
          <div
            key={idx}
            className="p-3.5 flex items-center justify-between border-b last:border-b-0 border-separator/30"
          >
            <div className="flex flex-col min-w-0 pr-3">
              <span className="text-subhead font-semibold text-label">
                {line.description}
              </span>
              <span className="text-caption text-label-2 tabular-nums">
                {line.qty} {line.unit} × {formatINR(line.rate)}
              </span>
            </div>
            <span className="text-subhead font-bold text-label tabular-nums">
              {formatINR(line.amount)}
            </span>
          </div>
        ))}
      </InsetGroup>

      {/* Financial Calculation */}
      <InsetGroup title="Amount Details">
        <Row
          title="Subtotal"
          trailing={<span className="tabular-nums font-semibold text-label">{formatINR(subtotalPaise)}</span>}
        />
        <Row
          title="Estimated GST (18%)"
          trailing={<span className="tabular-nums text-label-2">{formatINR(gstPaise)}</span>}
        />
        <Row
          title="Grand Total"
          trailing={
            <span className="tabular-nums text-headline font-bold text-accent">
              {formatINR(grandTotalPaise)}
            </span>
          }
        />
        <div className="p-3 bg-fill/20 border-t border-separator/40 text-footnote text-label-2 italic">
          {numberToIndianWords(grandTotalPaise)}
        </div>
      </InsetGroup>
    </LargeTitleScreen>
  );
};
