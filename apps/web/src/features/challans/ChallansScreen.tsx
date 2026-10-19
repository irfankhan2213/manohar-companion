import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Truck,
  ShoppingBag,
  ArrowDownLeft,
  FileSpreadsheet,
} from 'lucide-react';
import { formatINR } from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup, Row } from '../../components/ui/InsetGroup.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { Button } from '../../components/ui/Button.js';

type ChallanFilter = 'all' | 'sales' | 'purchase' | 'delivery';

export const ChallansScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentCompanyId } = useAppStore();
  const [filter, setFilter] = useState<ChallanFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ['challans', currentCompanyId, searchQuery, filter],
    queryFn: () => api.challans.list(currentCompanyId, searchQuery, filter),
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties', currentCompanyId],
    queryFn: () => api.parties.list(currentCompanyId),
  });

  const partyMap = new Map(parties.map((p) => [p.id, p]));

  const getTypeIcon = (type: 'sales' | 'purchase' | 'delivery') => {
    switch (type) {
      case 'sales':
        return <ShoppingBag className="w-5 h-5 text-accent" />;
      case 'purchase':
        return <ArrowDownLeft className="w-5 h-5 text-label-2" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-accent" />;
    }
  };

  const getStatusBadge = (status: 'synced' | 'queued' | 'failed' | 'draft') => {
    switch (status) {
      case 'synced':
        return <StatusText text="Updated in Tally" variant="ok" />;
      case 'queued':
        return <StatusText text="Waiting for Tally" variant="warn" />;
      case 'failed':
        return <StatusText text="Couldn't update" variant="danger" />;
      case 'draft':
        return <StatusText text="Draft" variant="neutral" />;
    }
  };

  return (
    <LargeTitleScreen
      title="Challans"
      headerAction={
        <Button
          size="small"
          onClick={() => navigate('/challans/new')}
          className="flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 stroke-[2.2]" />
          <span>New</span>
        </Button>
      }
    >
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-label-2" />
        <input
          type="text"
          placeholder="Search voucher #, party, vehicle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-surface rounded-xl border border-separator/60 text-body text-label placeholder:text-label-3 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
      </div>

      {/* Segmented Control for Types */}
      <SegmentedControl
        options={[
          { value: 'all', label: 'All' },
          { value: 'sales', label: 'Sales' },
          { value: 'purchase', label: 'Purchase' },
          { value: 'delivery', label: 'Delivery' },
        ]}
        value={filter}
        onChange={(val) => setFilter(val as ChallanFilter)}
      />

      {/* Challan List */}
      <InsetGroup>
        {isLoading ? (
          <div className="p-8 text-center text-label-2 text-subhead">
            Loading challans...
          </div>
        ) : challans.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <FileSpreadsheet className="w-8 h-8 text-label-3" />
            <span className="text-subhead font-semibold text-label">
              No challans found
            </span>
            <span className="text-footnote text-label-2">
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first delivery or sales challan'}
            </span>
            {!searchQuery && (
              <Button
                variant="tinted"
                size="small"
                onClick={() => navigate('/challans/new')}
                className="mt-2"
              >
                Create Challan
              </Button>
            )}
          </div>
        ) : (
          challans.map((challan) => {
            const party = partyMap.get(challan.partyId);
            const totalPaise = challan.lines.reduce(
              (acc, line) => acc + line.amount,
              0
            );
            const totalQty = challan.lines.reduce(
              (acc, line) => acc + line.qty,
              0
            );

            return (
              <Row
                key={challan.id}
                leading={getTypeIcon(challan.type)}
                title={<span className="font-semibold text-label">{challan.number}</span>}
                subtitle={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-label">
                      {party?.name ?? 'Unknown Party'}
                    </span>
                    <span className="text-label-3">·</span>
                    <span className="text-label-2">{challan.date}</span>
                    <span className="text-label-3">·</span>
                    <span className="text-label-2">
                      {challan.lines.length} {challan.lines.length === 1 ? 'item' : 'items'} ({totalQty} units)
                    </span>
                    {challan.vehicleNo && (
                      <>
                        <span className="text-label-3">·</span>
                        <span className="text-label-2 font-mono text-caption">
                          {challan.vehicleNo}
                        </span>
                      </>
                    )}
                  </span>
                }
                trailing={
                  <span className="tabular-nums font-semibold text-label">
                    {formatINR(totalPaise)}
                  </span>
                }
                trailingSubtitle={getStatusBadge(challan.status)}
                chevron
                onClick={() => navigate(`/challans/${challan.id}`)}
              />
            );
          })
        )}
      </InsetGroup>
    </LargeTitleScreen>
  );
};
