import { Role } from './types.js';

export const PERMISSION_KEYS = [
  'dashboard.view',
  'ledgers.view',
  'reminders.view',
  'reminders.send',
  'reminders.configure',
  'party.edit',
  'stock.view',
  'stock.adjust',
  'challan.view',
  'challan.create',
  'notebook.view',
  'notebook.edit',
  'activity.view',
  'tally.write',
  'tally.write.stock',
  'settings.manage',
  'users.manage',
  'clients.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const OPERATIONAL_PERMISSION_KEYS: PermissionKey[] = [
  'dashboard.view',
  'ledgers.view',
  'reminders.view',
  'reminders.send',
  'reminders.configure',
  'party.edit',
  'stock.view',
  'stock.adjust',
  'challan.view',
  'challan.create',
  'notebook.view',
  'notebook.edit',
  'activity.view',
  'tally.write',
  'tally.write.stock',
];

export const ADMIN_PERMISSION_KEYS: PermissionKey[] = [
  'settings.manage',
  'users.manage',
];

export const PLATFORM_PERMISSION_KEYS: PermissionKey[] = [
  'clients.manage',
];

export const ROLE_PERMISSIONS: Record<Role, Record<PermissionKey, boolean>> = {
  dev: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': true,
    'reminders.configure': true,
    'party.edit': true,
    'stock.view': true,
    'stock.adjust': true,
    'challan.view': true,
    'challan.create': true,
    'notebook.view': true,
    'notebook.edit': true,
    'activity.view': true,
    'tally.write': true,
    'tally.write.stock': true,
    'settings.manage': true,
    'users.manage': true,
    'clients.manage': true,
  },
  owner: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': true,
    'reminders.configure': true,
    'party.edit': true,
    'stock.view': true,
    'stock.adjust': true,
    'challan.view': true,
    'challan.create': true,
    'notebook.view': true,
    'notebook.edit': true,
    'activity.view': true,
    'tally.write': true,
    'tally.write.stock': true,
    'settings.manage': true,
    'users.manage': true,
    'clients.manage': false,
  },
  admin: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': true,
    'reminders.configure': true,
    'party.edit': true,
    'stock.view': true,
    'stock.adjust': true,
    'challan.view': true,
    'challan.create': true,
    'notebook.view': true,
    'notebook.edit': true,
    'activity.view': true,
    'tally.write': true,
    'tally.write.stock': true,
    'settings.manage': true,
    'users.manage': false,
    'clients.manage': false,
  },
  accounts: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': true,
    'reminders.configure': true,
    'party.edit': true,
    'stock.view': true,
    'stock.adjust': false,
    'challan.view': true,
    'challan.create': false,
    'notebook.view': true,
    'notebook.edit': true,
    'activity.view': true,
    'tally.write': true,
    'tally.write.stock': false,
    'settings.manage': false,
    'users.manage': false,
    'clients.manage': false,
  },
  sales: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': false,
    'reminders.configure': false,
    'party.edit': false,
    'stock.view': true,
    'stock.adjust': false,
    'challan.view': true,
    'challan.create': true,
    'notebook.view': true,
    'notebook.edit': true,
    'activity.view': false,
    'tally.write': false,
    'tally.write.stock': false,
    'settings.manage': false,
    'users.manage': false,
    'clients.manage': false,
  },
  stock_keeper: {
    'dashboard.view': true,
    'ledgers.view': false,
    'reminders.view': false,
    'reminders.send': false,
    'reminders.configure': false,
    'party.edit': false,
    'stock.view': true,
    'stock.adjust': true,
    'challan.view': true,
    'challan.create': true,
    'notebook.view': false,
    'notebook.edit': false,
    'activity.view': false,
    'tally.write': false,
    'tally.write.stock': true,
    'settings.manage': false,
    'users.manage': false,
    'clients.manage': false,
  },
  viewer: {
    'dashboard.view': true,
    'ledgers.view': true,
    'reminders.view': true,
    'reminders.send': false,
    'reminders.configure': false,
    'party.edit': false,
    'stock.view': true,
    'stock.adjust': false,
    'challan.view': true,
    'challan.create': false,
    'notebook.view': true,
    'notebook.edit': false,
    'activity.view': false,
    'tally.write': false,
    'tally.write.stock': false,
    'settings.manage': false,
    'users.manage': false,
    'clients.manage': false,
  },
};

function cloneRolePermissions(
  source: Record<Role, Record<PermissionKey, boolean>>
): Record<Role, Record<PermissionKey, boolean>> {
  return Object.fromEntries(
    Object.entries(source).map(([role, perms]) => [role, { ...perms }])
  ) as Record<Role, Record<PermissionKey, boolean>>;
}

export let CUSTOM_ROLE_PERMISSIONS: Record<Role, Record<PermissionKey, boolean>> =
  cloneRolePermissions(ROLE_PERMISSIONS);

export function setCustomPermissions(perms: Record<Role, Record<PermissionKey, boolean>>) {
  CUSTOM_ROLE_PERMISSIONS = cloneRolePermissions(perms);
}

export function can(
  roleOrUser: Role | { role: Role; customPermissions?: string[] } | null | undefined,
  permission: PermissionKey
): boolean {
  if (!roleOrUser) return false;
  if (typeof roleOrUser === 'string') {
    const role = roleOrUser as Role;
    if (permission === 'clients.manage' && role !== 'dev') return false;
    const rolePerms = CUSTOM_ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[role];
    return rolePerms ? rolePerms[permission] === true : false;
  }
  const u = roleOrUser;
  if (u.role === 'dev') return true;
  // Non-dev users can NEVER obtain platform clients.manage permission even if in customPermissions
  if (permission === 'clients.manage') return false;
  if (Array.isArray(u.customPermissions)) {
    return u.customPermissions.includes(permission);
  }
  const rolePerms = CUSTOM_ROLE_PERMISSIONS[u.role] || ROLE_PERMISSIONS[u.role];
  return rolePerms ? rolePerms[permission] === true : false;
}
