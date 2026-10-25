import { formatINR } from '@saas/shared';

export interface WhatsAppReminderData {
  phone: string;
  partyName: string;
  overdueAmountPaise: number;
  oldestBillNo?: string;
  daysLate?: number;
  dueDate?: string;
}

export function buildWhatsAppReminderMessage(data: WhatsAppReminderData): string {
  const amountStr = formatINR(data.overdueAmountPaise);
  let msg = `Dear *${data.partyName}*,\n\nGreetings from *Manohar Traders*.\n\nThis is a gentle payment reminder regarding your pending balance of *${amountStr}* which is currently overdue`;
  if (data.daysLate && data.daysLate > 0) {
    msg += ` by ${data.daysLate} days`;
  }
  if (data.oldestBillNo) {
    msg += ` (Invoice: ${data.oldestBillNo}${data.dueDate ? `, due on ${data.dueDate}` : ''})`;
  }
  msg += `.\n\nKindly arrange for the payment clearance at your earliest convenience. If the payment has already been remitted or for any clarifications, please reach us at +91 98140 11223.\n\nThank you for your business,\n*Manohar Traders, Ludhiana*`;
  return msg;
}

export function openWhatsAppReminderUrl(data: WhatsAppReminderData): string {
  const cleanPhone = (data.phone || '').replace(/\D/g, '');
  const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const message = buildWhatsAppReminderMessage(data);
  const url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return url;
}
