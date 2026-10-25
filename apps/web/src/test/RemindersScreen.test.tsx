import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { RemindersScreen } from '../features/reminders/RemindersScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { buildWhatsAppReminderMessage, openWhatsAppReminderUrl } from '../features/reminders/whatsapp.js';
import '../i18n/index.js';

describe('RemindersScreen Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <RemindersScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders automatic reminders switch and configuration rows', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Automatic Reminders')).toBeInTheDocument();
      expect(screen.getByText('Schedule')).toBeInTheDocument();
      expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
      expect(screen.getByText('Smallest Amount')).toBeInTheDocument();
    });
  });

  it('renders replies and message templates navigation rows', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Replies')).toBeInTheDocument();
      expect(screen.getByText('Message Templates')).toBeInTheDocument();
    });
  });

  it('renders WhatsApp reminder system toggle, overdue accounts, and Send Reminder button', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('WhatsApp Reminder System')).toBeInTheDocument();
      expect(screen.getByText('Overdue Accounts For Follow-up')).toBeInTheDocument();
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.getAllByText('Send Reminder').length).toBeGreaterThan(0);
      expect(screen.getAllByText('+ Add Person / Phone').length).toBeGreaterThan(0);
    });
  });

  it('builds pre-filled WhatsApp message with overdue balance and oldest invoice details', () => {
    const text = buildWhatsAppReminderMessage({
      phone: '+91 98141 23456',
      partyName: 'Bharat Textiles',
      overdueAmountPaise: 69840000,
      oldestBillNo: 'GST/001/26-27',
      daysLate: 38,
      dueDate: '2026-06-09',
      companyName: 'Manohar Traders',
    });

    expect(text).toContain('Dear *Bharat Textiles*');
    expect(text).toContain('₹6,98,400');
    expect(text).toContain('38 days');
    expect(text).toContain('GST/001/26-27');
    expect(text).toContain('Manohar Traders');

    // Test URL generator
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const url = openWhatsAppReminderUrl({
      phone: '9814123456',
      partyName: 'Bharat Textiles',
      overdueAmountPaise: 69840000,
    });
    expect(url).toContain('https://wa.me/919814123456?text=');
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
