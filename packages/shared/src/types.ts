import { z } from 'zod';

export type Id = string;
export type Paise = number; // integer, 1 rupee = 100 paise
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601 string

export const RoleSchema = z.enum([
  'owner',
  'admin',
  'accounts',
  'sales',
  'stock_keeper',
  'viewer',
]);
export type Role = z.infer<typeof RoleSchema>;

export const CompanySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  tallyName: z.string(),
  financialYear: z.string(),
  gstin: z.string().optional(),
  lastSyncedAt: z.string(),
  agentStatus: z.enum(['online', 'offline']),
});
export type Company = z.infer<typeof CompanySchema>;

export const UserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  phone: z.string(),
  role: RoleSchema,
  companyIds: z.union([z.array(z.string()), z.literal('all')]),
  active: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

export const PartySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  companyId: z.string(),
  name: z.string(),
  city: z.string(),
  phones: z.array(z.string()),
  gstin: z.string().optional(),
  creditDays: z.number().int().nonnegative(),
  collectorId: z.string().optional(),
  remindersPaused: z.boolean(),
  notes: z.string(),
  promiseToPay: z.string().optional(),
});
export type Party = z.infer<typeof PartySchema>;

export const BillSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  partyId: z.string(),
  billNo: z.string(),
  date: z.string(),
  dueDate: z.string(),
  amount: z.number().int(),
  pending: z.number().int(),
  source: z.enum(['tally_bill', 'estimated']),
});
export type Bill = z.infer<typeof BillSchema>;

export const LedgerLineSchema = z.object({
  date: z.string(),
  particulars: z.string(),
  voucherType: z.enum(['Sales', 'Receipt', 'Journal', 'Credit Note']),
  voucherNo: z.string(),
  debit: z.number().int(),
  credit: z.number().int(),
});
export type LedgerLine = z.infer<typeof LedgerLineSchema>;

export const GodownSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
});
export type Godown = z.infer<typeof GodownSchema>;

export const StockItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  partNo: z.string().optional(),
  unit: z.enum(['pcs', 'set', 'box', 'mtr']),
  group: z.string(),
  rate: z.number().int(),
  reorderLevel: z.number(),
  alias: z.string().optional(),
});
export type StockItem = z.infer<typeof StockItemSchema>;

export const StockBalanceSchema = z.object({
  itemId: z.string(),
  godownId: z.string(),
  qty: z.number(),
});
export type StockBalance = z.infer<typeof StockBalanceSchema>;

export const QueueStatusSchema = z.enum(['draft', 'queued', 'synced', 'failed']);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const ChallanLineSchema = z.object({
  itemId: z.string(),
  description: z.string(),
  qty: z.number(),
  unit: z.string(),
  rate: z.number().int(),
  amount: z.number().int(),
});
export type ChallanLine = z.infer<typeof ChallanLineSchema>;

export const ChallanSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  type: z.enum(['sales', 'purchase', 'delivery']),
  number: z.string(),
  date: z.string(),
  partyId: z.string(),
  lines: z.array(ChallanLineSchema),
  vehicleNo: z.string().optional(),
  lrNo: z.string().optional(),
  narration: z.string().optional(),
  status: QueueStatusSchema,
  failureReason: z.string().optional(),
  createdBy: z.string(),
});
export type Challan = z.infer<typeof ChallanSchema>;

export const ColumnTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'party',
  'item',
  'computed',
]);
export type ColumnType = z.infer<typeof ColumnTypeSchema>;

export const NotebookColumnSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  type: ColumnTypeSchema,
  decimals: z.number().optional(),
  formula: z.string().optional(),
  total: z.enum(['sum', 'avg', 'count', 'min', 'max']).nullable().optional(),
});
export type NotebookColumn = z.infer<typeof NotebookColumnSchema>;

export const CellSchema = z.object({
  raw: z.string(),
  value: z.string().optional(),
  error: z.string().optional(),
});
export type Cell = z.infer<typeof CellSchema>;

export const NotebookRowSchema = z.object({
  id: z.string(),
  cells: z.record(z.string(), CellSchema),
  linkedPartyId: z.string().optional(),
  linkedItemId: z.string().optional(),
});
export type NotebookRow = z.infer<typeof NotebookRowSchema>;

export const NotebookSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  title: z.string(),
  columns: z.array(NotebookColumnSchema),
  rows: z.array(NotebookRowSchema),
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type Notebook = z.infer<typeof NotebookSchema>;

export const TemplateKeySchema = z.enum([
  'due_soon',
  'due_today',
  'overdue',
  'payment_received',
]);
export type TemplateKey = z.infer<typeof TemplateKeySchema>;

export const ReminderRuleSchema = z.object({
  tenantId: z.string(),
  enabled: z.boolean(),
  steps: z.array(
    z.object({
      offsetDays: z.number(),
      template: TemplateKeySchema,
      enabled: z.boolean(),
    })
  ),
  quietHours: z.object({
    from: z.string(),
    to: z.string(),
    days: z.array(z.number()),
  }),
  minAmount: z.number().int(),
  stopWhenPaid: z.literal(true),
});
export type ReminderRule = z.infer<typeof ReminderRuleSchema>;

export const ReminderMessageSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  partyId: z.string(),
  billId: z.string().optional(),
  template: TemplateKeySchema,
  sentAt: z.string(),
  status: z.enum(['queued', 'sent', 'delivered', 'read', 'failed']),
  failureReason: z.string().optional(),
});
export type ReminderMessage = z.infer<typeof ReminderMessageSchema>;

export const ReplyThreadSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  partyId: z.string(),
  unread: z.number().int(),
  lastCustomerMessageAt: z.string(),
  messages: z.array(
    z.object({
      from: z.enum(['customer', 'us']),
      text: z.string(),
      at: z.string(),
    })
  ),
});
export type ReplyThread = z.infer<typeof ReplyThreadSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  companyId: z.string().optional(),
  actorId: z.string(),
  action: z.string(),
  target: z.string(),
  at: z.string(),
  device: z.enum(['iPhone', 'Android', 'Desktop', 'Agent']),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const OutboxItemSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  kind: z.enum(['stock_journal', 'challan', 'receipt']),
  refId: z.string(),
  status: QueueStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().optional(),
});
export type OutboxItem = z.infer<typeof OutboxItemSchema>;

export const AgentSchema = z.object({
  version: z.string(),
  status: z.enum(['online', 'offline']),
  lastSeenAt: z.string(),
  pairingCode: z.string().optional(),
  pairingExpiresAt: z.string().optional(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgingBucketSchema = z.enum([
  'not_due',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
]);
export type AgingBucket = z.infer<typeof AgingBucketSchema>;
