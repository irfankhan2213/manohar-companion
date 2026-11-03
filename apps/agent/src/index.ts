#!/usr/bin/env node

import { TallyClient } from './tally/client.js';
import { StateStore } from './sync/state.js';
import { SyncEngine } from './sync/engine.js';
import { formatINR } from '@saas/shared';

const args = process.argv.slice(2);
const command = args[0] || 'help';

const isMock = args.includes('--mock');
const intervalArg = args.find((a) => a.startsWith('--interval='));
const pollIntervalMs = intervalArg ? parseInt(intervalArg.split('=')[1]!, 10) : 30000;

const cloudArg = args.find((a) => a.startsWith('--cloud='));
const companyArg = args.find((a) => a.startsWith('--company='));
const keyArg = args.find((a) => a.startsWith('--key='));
const tallyArg = args.find((a) => a.startsWith('--tally='));

const store = new StateStore();
const savedState = store.get();

const cloudUrl = cloudArg ? cloudArg.split('=')[1] : (process.env.CLOUD_URL || savedState.cloudUrl || 'https://manohar.evolveexpert.com');
const companyId = companyArg ? companyArg.split('=')[1] : (process.env.COMPANY_ID || savedState.companyId || '');
const agentSecretKey = keyArg ? keyArg.split('=')[1] : (process.env.AGENT_KEY || savedState.agentSecretKey || 'dev-agent-secret-key');
const tallyUrl = tallyArg ? tallyArg.split('=')[1] : (process.env.TALLY_URL || 'http://127.0.0.1:9000');

const client = new TallyClient({
  url: tallyUrl,
  mock: isMock,
});

const engine = new SyncEngine({
  client,
  store,
  cloudUrl,
  companyId,
  agentSecretKey,
  pollIntervalMs,
  onSyncComplete: (p) => {
    console.log(
      `[${new Date().toLocaleTimeString()}] Sync OK · Co: "${p.company.name}" · Ledgers: ${p.ledgers.length} · Bills: ${p.bills.length} · Stock: ${p.stockItems.length} · AlterID: ${p.maxAlterId} (${p.durationMs}ms)`
    );
  },
  onSyncError: (e) => {
    console.error(`[${new Date().toLocaleTimeString()}] Sync Failed: ${e.message}`);
  },
});

async function main() {
  switch (command) {
    case 'status': {
      console.log('=== Manohar Traders TallyPrime Sync Agent ===');
      const ping = await client.ping();
      const state = store.get();

      console.log(`\n[Local Tally Configuration]`);
      console.log(`Tally URL:  ${tallyUrl}`);
      console.log(`Connection: ${ping.ok ? 'ONLINE' : 'OFFLINE'}`);
      console.log(`Mode:       ${client.isMockMode() ? 'Mock Simulator' : 'Live Tally (port 9000)'}`);
      if (ping.company) console.log(`Active Co:  ${ping.company}`);
      if (ping.error) console.log(`Error:      ${ping.error}`);

      console.log(`\n[Cloud SaaS Configuration]`);
      console.log(`Cloud URL:  ${cloudUrl || 'Not set'}`);
      console.log(`Company ID: ${companyId ? `${companyId}${savedState.companyName ? ` (${savedState.companyName})` : ''}` : 'NOT CONNECTED (Run \'tally-agent pair <code>\')'}`);
      console.log(`Tenant ID:  ${savedState.tenantId || 'Not set'}`);
      console.log(`Agent Key:  ${agentSecretKey ? '••••••••' + agentSecretKey.slice(-4) : 'Not configured'}`);

      try {
        const infoRes = await fetch(`${cloudUrl}/api/sync/info`, {
          headers: { 'x-agent-key': agentSecretKey || '' },
        });
        if (infoRes.ok) {
          const info: any = await infoRes.json();
          console.log(`Cloud Link: CONNECTED (Server time: ${info.serverTime})`);
          if (info.companies?.length) {
            console.log(`Companies:  ${info.companies.map((c: any) => `${c.name} (${c.id})`).join(', ')}`);
          }
        } else {
          console.log(`Cloud Link: AUTH/SERVER ERROR (${infoRes.status})`);
        }
      } catch (err: any) {
        console.log(`Cloud Link: OFFLINE (${err.message})`);
      }

      console.log(`\n[Sync Progress]`);
      console.log(`Last Alter: ${state.lastAlterId}`);
      console.log(`Last Sync:  ${state.lastSyncedAt || 'Never'}`);
      if (state.lastSyncStats) {
        console.log(`Last Push:  ${state.lastSyncStats.partiesUpdated} parties, ${state.lastSyncStats.billsUpdated} bills, ${state.lastSyncStats.stockUpdated} stock items`);
      }
      break;
    }

    case 'config': {
      const patch: any = {};
      if (cloudArg) patch.cloudUrl = cloudArg.split('=')[1];
      if (companyArg) patch.companyId = companyArg.split('=')[1];
      if (keyArg) patch.agentSecretKey = keyArg.split('=')[1];
      if (tallyArg) patch.tallyUrl = tallyArg.split('=')[1];
      store.update(patch);
      console.log('Configuration updated:');
      console.log(store.get());
      break;
    }

    case 'test': {
      console.log('Testing Tally and Cloud connections...');
      const ping = await client.ping();
      console.log(`1. TallyPrime (port 9000): ${ping.ok ? 'SUCCESS (' + ping.company + ')' : 'FAILED: ' + ping.error}`);
      try {
        const res = await fetch(`${cloudUrl}/api/sync/info`, {
          headers: { 'x-agent-key': agentSecretKey || '' },
        });
        if (res.ok) {
          console.log(`2. Cloud SaaS API:         SUCCESS (${cloudUrl})`);
        } else {
          console.log(`2. Cloud SaaS API:         ERROR (${res.status} ${res.statusText})`);
        }
      } catch (e: any) {
        console.log(`2. Cloud SaaS API:         FAILED (${e.message})`);
      }
      break;
    }

    case 'sync': {
      if (!companyId) {
        console.error('\n[Error] Agent is not connected to any company / organization!');
        console.error('Please connect your agent using one of the following methods:');
        console.error('  1. Generate a Pairing Code in the Web App (Settings -> Desktop Tally Agent)');
        console.error('  2. Run: tally-agent pair <6-digit-code>');
        console.error('  3. Or run run-agent.bat and choose Option [4].\n');
        process.exit(1);
      }
      console.log(`Starting 2-way sync (Mode: ${client.isMockMode() ? 'Mock' : 'Live'})...`);
      try {
        const payload = await engine.runSyncOnce();
        console.log('\n--- Sync Results ---');
        console.log(`Company:       ${payload.company.name} (FY from ${payload.company.financialYearFrom})`);
        console.log(`New Ledgers:   ${payload.ledgers.length}`);
        payload.ledgers.slice(0, 5).forEach((l) => {
          console.log(`  • ${l.name} (${l.parent}) - AlterID: ${l.alterId} - Balance: ${formatINR(l.closingBalance)}`);
        });
        if (payload.ledgers.length > 5) console.log(`  ... and ${payload.ledgers.length - 5} more`);

        console.log(`\nActive Bills:  ${payload.bills.length}`);
        payload.bills.slice(0, 5).forEach((b) => {
          console.log(`  • [${b.partyName}] ${b.billNo} - Due: ${b.dueDate} - Pending: ${formatINR(b.pendingAmount)} (${b.daysOverdue}d late)`);
        });
        if (payload.bills.length > 5) console.log(`  ... and ${payload.bills.length - 5} more`);

        console.log(`\nStock Items:   ${payload.stockItems.length}`);
        payload.stockItems.slice(0, 5).forEach((s) => {
          console.log(`  • ${s.name} - Qty: ${s.closingQty} ${s.baseUnits} - Rate: ${formatINR(s.closingRate)} - AlterID: ${s.alterId}`);
        });
        if (payload.stockItems.length > 5) console.log(`  ... and ${payload.stockItems.length - 5} more`);

        console.log(`\nMax AlterID:   ${payload.maxAlterId}`);
        console.log(`Duration:      ${payload.durationMs}ms`);
        if (cloudUrl) {
          console.log(`\n✓ Pushed to Cloud SaaS: ${cloudUrl}`);
        }
      } catch (err: any) {
        console.error('Sync failed:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'start': {
      if (!companyId) {
        console.error('\n[Error] Agent is not connected to any company / organization!');
        console.error('Please connect your agent using one of the following methods:');
        console.error('  1. Generate a Pairing Code in the Web App (Settings -> Desktop Tally Agent)');
        console.error('  2. Run: tally-agent pair <6-digit-code>');
        console.error('  3. Or run run-agent.bat and choose Option [4].\n');
        process.exit(1);
      }
      console.log(`Starting Tally Sync Agent daemon (Poll Interval: ${pollIntervalMs}ms)...`);
      console.log(`Tally URL:  ${tallyUrl}`);
      console.log(`Cloud URL:  ${cloudUrl}`);
      console.log(`Company ID: ${companyId}${savedState.companyName ? ` (${savedState.companyName})` : ''}`);
      engine.startPolling();

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nStopping agent...');
        engine.stopPolling();
        process.exit(0);
      });
      break;
    }

    case 'pair': {
      const code = args[1];
      if (!code || !/^\d{6}$/.test(code.trim())) {
        console.error('Error: Please provide a valid 6-digit pairing code, e.g. tally-agent pair 839201');
        process.exit(1);
      }
      const pairCode = code.trim();
      const targetCloudUrl = cloudArg ? cloudArg.split('=')[1] : (process.env.CLOUD_URL || savedState.cloudUrl || 'https://manohar.evolveexpert.com');
      console.log(`Connecting to Cloud SaaS: ${targetCloudUrl}`);
      console.log(`Submitting pairing code:  ${pairCode}...`);
      try {
        const res = await fetch(`${targetCloudUrl}/api/agent/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: pairCode }),
        });
        const data: any = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Server returned error (${res.status})`);
        }
        store.update({
          companyId: data.companyId,
          companyName: data.companyName,
          tenantId: data.tenantId,
          agentSecretKey: data.agentSecretKey,
          cloudUrl: data.cloudUrl || targetCloudUrl,
          pairingKey: pairCode,
          status: 'online',
        });
        console.log(`\n================================================================`);
        console.log(`✓ PAIRING SUCCESSFUL!`);
        console.log(`Connected to Organization: "${data.companyName}"`);
        console.log(`Company ID:                ${data.companyId}`);
        if (data.tenantId) {
          console.log(`Tenant ID:                 ${data.tenantId}`);
        }
        console.log(`Cloud Server:              ${data.cloudUrl || targetCloudUrl}`);
        console.log(`================================================================\n`);
        console.log(`Agent is now permanently configured for "${data.companyName}".`);
        console.log(`You can run 'tally-agent sync' to start syncing.`);
      } catch (err: any) {
        console.error(`\n✗ Pairing failed: ${err.message}`);
        console.error(`Please make sure the pairing code has not expired (valid for 10m) and cloud server is reachable.`);
        process.exit(1);
      }
      break;
    }

    case 'reset': {
      store.reset();
      console.log('Agent state reset. Next sync will fetch from AlterID 0.');
      break;
    }

    case 'help':
    default: {
      console.log(`Manohar Companion Windows Tally Agent
Commands:
  status               Check local Tally connection & Cloud sync status
  test                 Verify connection to local Tally and Cloud API
  sync [--mock]        Run one-shot 2-way sync (push data, pull challans)
  start [--mock]       Start background sync daemon
  pair <code>          Pair agent with organization using 6-digit code from Web App
  config --cloud=URL --company=ID --key=KEY   Save configuration manually
  reset                Reset AlterID counter and state`);
      break;
    }
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
