import { describe, expect, it } from 'vitest';
import { can, PERMISSION_KEYS, ROLE_PERMISSIONS } from '../src/permissions.js';

describe('permissions and RBAC matrix', () => {
  it('correctly maps owner permissions', () => {
    for (const key of PERMISSION_KEYS) {
      expect(can('owner', key)).toBe(true);
    }
  });

  it('restricts viewer from mutating actions', () => {
    expect(can('viewer', 'dashboard.view')).toBe(true);
    expect(can('viewer', 'ledgers.view')).toBe(true);
    expect(can('viewer', 'stock.view')).toBe(true);
    expect(can('viewer', 'reminders.send')).toBe(false);
    expect(can('viewer', 'stock.adjust')).toBe(false);
    expect(can('viewer', 'party.edit')).toBe(false);
    expect(can('viewer', 'challan.create')).toBe(false);
    expect(can('viewer', 'notebook.edit')).toBe(false);
  });

  it('restricts stock_keeper to stock and challan without financials', () => {
    expect(can('stock_keeper', 'stock.view')).toBe(true);
    expect(can('stock_keeper', 'stock.adjust')).toBe(true);
    expect(can('stock_keeper', 'tally.write.stock')).toBe(true);
    expect(can('stock_keeper', 'challan.create')).toBe(true);
    expect(can('stock_keeper', 'ledgers.view')).toBe(false);
    expect(can('stock_keeper', 'reminders.view')).toBe(false);
    expect(can('stock_keeper', 'notebook.view')).toBe(false);
  });

  it('allows accounts to send reminders and view financials but not adjust stock', () => {
    expect(can('accounts', 'reminders.send')).toBe(true);
    expect(can('accounts', 'ledgers.view')).toBe(true);
    expect(can('accounts', 'stock.adjust')).toBe(false);
    expect(can('accounts', 'users.manage')).toBe(false);
  });

  it('snapshots role permission configuration matrix', () => {
    expect(ROLE_PERMISSIONS).toMatchSnapshot();
  });
});
