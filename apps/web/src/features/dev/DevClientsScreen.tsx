import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { InsetGroup } from '../../components/ui/InsetGroup.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { useToast } from '../../components/ui/Toast.js';

export const DevClientsScreen: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { setCompanyId, currentUser } = useAppStore();

  const [onboardOpen, setOnboardOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPin, setOwnerPin] = useState('1234');
  const [tallyCompany, setTallyCompany] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    orgName: string;
    ownerName: string;
    phone: string;
    pin: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch all clients
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['dev-clients'],
    queryFn: () => api.dev.clients.list(),
  });

  const onboardMutation = useMutation({
    mutationFn: () =>
      api.dev.clients.create({
        name: orgName,
        ownerName,
        ownerPhone,
        ownerPin,
        tallyCompanyName: tallyCompany || orgName,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dev-clients'] });
      setOnboardOpen(false);
      setCreatedCredentials({
        orgName: data.tenant.name,
        ownerName: data.owner.name,
        phone: data.owner.phone,
        pin: data.owner.pin || ownerPin,
      });
      showToast({
        message: `Client "${data.tenant.name}" onboarded successfully!`,
        variant: 'success',
      });
      setOrgName('');
      setOwnerName('');
      setOwnerPhone('');
      setOwnerPin('1234');
      setTallyCompany('');
    },
    onError: (err: any) => {
      showToast({ message: err.message || 'Failed to onboard client', variant: 'danger' });
    },
  });

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `🎉 Welcome to Manohar Companion SaaS!\nOrganization: ${createdCredentials.orgName}\nOwner: ${createdCredentials.ownerName}\nPhone: ${createdCredentials.phone}\nPIN: ${createdCredentials.pin}\nLink: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast({ message: 'Client credentials copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInspectClient = (client: any) => {
    if (client.companies?.[0]) {
      setCompanyId(client.companies[0].id);
      showToast({
        message: `Switched view to ${client.name}`,
        variant: 'success',
      });
      navigate('/');
    }
  };

  return (
    <LargeTitleScreen
      title="Client Organizations"
      headerAction={
        <Button
          size="small"
          onClick={() => setOnboardOpen(true)}
          className="flex items-center gap-1.5"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Onboard Client</span>
        </Button>
      }
    >
      {/* Dev Role Banner */}
      <div className="mx-4 mb-4 p-4 rounded-2xl bg-accent-soft border border-accent/20 flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-accent shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="text-subhead font-bold text-label">
            Platform Developer Console
          </span>
          <span className="text-footnote text-label-2">
            You are signed in as <strong>{currentUser?.name || 'Dev Admin'}</strong>. You can onboard new client organizations, manage their initial business owners, and inspect client workspaces.
          </span>
        </div>
      </div>

      {/* Created Credentials Modal / Banner */}
      {createdCredentials && (
        <div className="mx-4 mb-5 p-4 rounded-2xl bg-surface border-2 border-ok/40 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-ok">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-subhead font-bold">New Client Ready!</span>
            </div>
            <button
              type="button"
              onClick={() => setCreatedCredentials(null)}
              className="text-caption text-label-3 hover:text-label"
            >
              Dismiss
            </button>
          </div>

          <div className="p-3 bg-fill rounded-xl font-mono text-footnote flex flex-col gap-1 text-label">
            <div><strong>Organization:</strong> {createdCredentials.orgName}</div>
            <div><strong>Owner Name:</strong> {createdCredentials.ownerName}</div>
            <div><strong>Login Phone:</strong> {createdCredentials.phone}</div>
            <div><strong>Login PIN:</strong> {createdCredentials.pin}</div>
          </div>

          <Button
            variant="tinted"
            size="small"
            onClick={handleCopyCredentials}
            className="flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Credentials for Client'}</span>
          </Button>
        </div>
      )}

      {/* Onboarded Clients List */}
      <InsetGroup title={`Active Clients (${clients.length})`}>
        {isLoading ? (
          <div className="p-8 text-center text-label-2 animate-pulse">
            Loading client organizations...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-label-2">
            No client organizations onboarded yet. Tap "+ Onboard Client" to add one.
          </div>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              className="p-4 bg-surface rounded-2xl border border-separator/40 flex flex-col gap-3 mb-2.5 last:mb-0"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-headline font-bold text-label">
                        {client.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ok/10 text-ok">
                        {client.status || 'Active'}
                      </span>
                    </div>
                    <span className="text-caption text-label-2">
                      Tenant ID: <span className="font-mono">{client.id}</span>
                    </span>
                  </div>
                </div>

                <Button
                  size="small"
                  variant="tinted"
                  onClick={() => handleInspectClient(client)}
                  className="flex items-center gap-1.5"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Owner and Connected Companies Details */}
              <div className="pt-2 border-t border-separator/40 grid grid-cols-2 gap-2 text-footnote">
                <div className="flex flex-col">
                  <span className="text-label-3 text-[11px] uppercase font-bold">Client Owner</span>
                  <span className="text-label font-semibold">{client.owner?.name || client.ownerName}</span>
                  <span className="text-label-2 text-caption">{client.owner?.phone || client.ownerPhone}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-label-3 text-[11px] uppercase font-bold">Connected Companies</span>
                  <span className="text-label font-semibold">
                    {client.companies?.length || 0} Tally Company
                  </span>
                  <span className="text-label-2 text-caption">
                    {client.companies?.[0]?.name || 'Pending Sync Setup'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </InsetGroup>

      {/* Onboard Client Sheet */}
      <Sheet
        open={onboardOpen}
        onOpenChange={setOnboardOpen}
        title="Onboard New Client"
        description="Create an organization tenant, assign client owner credentials, and setup initial company."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!orgName.trim() || !ownerName.trim() || !ownerPhone.trim()) {
              showToast({ message: 'Please fill all required fields', variant: 'danger' });
              return;
            }
            onboardMutation.mutate();
          }}
          className="flex flex-col gap-4 py-2"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
              Organization / Client Name *
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Ludhiana Woolens"
              className="px-3.5 py-2.5 rounded-xl bg-fill border border-separator/50 text-subhead font-semibold text-label focus:outline-none focus:border-accent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
                Owner Full Name *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Harpreet Singh"
                className="px-3.5 py-2.5 rounded-xl bg-fill border border-separator/50 text-subhead font-semibold text-label focus:outline-none focus:border-accent"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
                Owner Phone (WhatsApp) *
              </label>
              <input
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="e.g. +91 98141 88888"
                className="px-3.5 py-2.5 rounded-xl bg-fill border border-separator/50 text-subhead font-semibold text-label focus:outline-none focus:border-accent"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
                Initial 4-Digit PIN
              </label>
              <input
                type="text"
                maxLength={6}
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value)}
                placeholder="1234"
                className="px-3.5 py-2.5 rounded-xl bg-fill border border-separator/50 text-subhead font-mono font-bold tracking-widest text-label focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
                Initial Tally Company
              </label>
              <input
                type="text"
                value={tallyCompany}
                onChange={(e) => setTallyCompany(e.target.value)}
                placeholder="e.g. Ludhiana Woolens Pvt Ltd"
                className="px-3.5 py-2.5 rounded-xl bg-fill border border-separator/50 text-subhead font-semibold text-label focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="pt-3">
            <Button
              type="submit"
              disabled={onboardMutation.isPending}
              className="w-full font-bold h-11"
            >
              {onboardMutation.isPending ? 'Onboarding Client...' : 'Create & Onboard Client'}
            </Button>
          </div>
        </form>
      </Sheet>
    </LargeTitleScreen>
  );
};
