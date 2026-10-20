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

const client = new TallyClient({
  url: process.env.TALLY_URL || 'http://127.0.0.1:9000',
  mock: isMock,
});

const store = new StateStore();
const engine = new SyncEngine({
  client,
  store,
  pollIntervalMs,
  onSyncComplete: (p) => {
    console.log(
      `[${new Date().toLocaleTimeString()}] Sync OK · Company: "${p.company.name}" · Ledgers: ${p.ledgers.length} · Bills: ${p.bills.length} · Stock: ${p.stockItems.length} · AlterID: ${p.maxAlterId} (${p.durationMs}ms)`
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

      console.log(`Connection: ${ping.ok ? 'ONLINE' : 'OFFLINE'}`);
      console.log(`Mode:       ${client.isMockMode() ? 'Mock Simulator' : 'Live Tally (port 9000)'}`);
      if (ping.company) console.log(`Active Co:  ${ping.company}`);
      console.log(`AlterID:    ${state.lastAlterId}`);
      console.log(`Last Sync:  ${state.lastSyncedAt || 'Never'}`);
      console.log(`Pairing:    ${state.pairingKey || 'Unpaired'}`);
      break;
    }

    case 'sync': {
      console.log(`Starting one-time sync (Mode: ${client.isMockMode() ? 'Mock' : 'Live'})...`);
      try {
        const payload = await engine.runSyncOnce();
        console.log('\n--- Sync Results ---');
        console.log(`Company:       ${payload.company.name} (FY from ${payload.company.financialYearFrom})`);
        console.log(`New Ledgers:   ${payload.ledgers.length}`);
        payload.ledgers.forEach((l) => {
          console.log(`  • ${l.name} (${l.parent}) - AlterID: ${l.alterId} - Balance: ${formatINR(l.closingBalance)}`);
        });

        console.log(`\nActive Bills:  ${payload.bills.length}`);
        payload.bills.forEach((b) => {
          console.log(`  • [${b.partyName}] ${b.billNo} - Due: ${b.dueDate} - Pending: ${formatINR(b.pendingAmount)} (${b.daysOverdue}d late)`);
        });

        console.log(`\nStock Items:   ${payload.stockItems.length}`);
        payload.stockItems.forEach((s) => {
          console.log(`  • ${s.name} - Qty: ${s.closingQty} ${s.baseUnits} - Rate: ${formatINR(s.closingRate)} - AlterID: ${s.alterId}`);
        });

        console.log(`\nMax AlterID:   ${payload.maxAlterId}`);
        console.log(`Duration:      ${payload.durationMs}ms`);
      } catch (err: any) {
        console.error('Sync failed:', err.message);
        process.exit(1);
      }
      break;
    }

    case 'start': {
      console.log(`Starting Tally Sync Agent daemon (Poll Interval: ${pollIntervalMs}ms)...`);
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
      if (!code) {
        console.error('Error: Please provide pairing code, e.g. tally-agent pair 839201');
        process.exit(1);
      }
      store.update({ pairingKey: code });
      console.log(`Paired successfully with code: ${code}`);
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
  status               Check local Tally connection & AlterID
  sync [--mock]        Run one-shot sync and print details
  start [--mock]       Start background sync daemon
  pair <code>          Set 6-digit agent pairing key
  reset                Reset AlterID counter and state`);
      break;
    }
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
