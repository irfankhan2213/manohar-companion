import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import '../i18n/index.js';

describe('PartyDetailScreen Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMockDB();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderComponent = (partyId = 'p-sample') =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/collections/${partyId}`]}>
            <Routes>
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders customer party details, hero amount, and quick contact bar with Call and WhatsApp actions', async () => {
    renderComponent('p-sample');

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.getByText('Kanpur')).toBeInTheDocument();
      expect(screen.getByText('Customer')).toBeInTheDocument();
      expect(screen.getByText('Currently owes')).toBeInTheDocument();
    });

    // Quick contact bar has call and whatsapp links
    const callLinks = screen.getAllByRole('link', { name: /Call/i });
    expect(callLinks.length).toBeGreaterThanOrEqual(1);
    expect(callLinks[0]?.getAttribute('href')).toMatch(/^tel:/);

    const waLinks = screen.getAllByRole('link', { name: /WhatsApp/i });
    expect(waLinks.length).toBeGreaterThanOrEqual(1);
    expect(waLinks[0]?.getAttribute('href')).toMatch(/^https:\/\/wa\.me\//);
  });

  it('displays separate Tally Master Numbers and Local Contact Numbers sections in Details sheet', async () => {
    // Seed party with both tally phones and local customPhones
    await mockApiClient.parties.update('p-sample', {
      phones: ['+91 98390 12345'],
      customPhones: ['+91 94150 99999'],
    });

    renderComponent('p-sample');

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    // Open Details sheet
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    await waitFor(() => {
      expect(screen.getByText('Tally Master Numbers')).toBeInTheDocument();
      expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
    });

    // Verify Tally section shows Tally badge & action links
    expect(screen.getByText('Read-only · Synced from Tally ERP')).toBeInTheDocument();
    expect(screen.getByText('Tally')).toBeInTheDocument();
    expect(screen.getAllByText('+91 98390 12345').length).toBeGreaterThanOrEqual(1);

    // Verify Local section shows Local badge & action links
    expect(screen.getByText('Stored locally · Preserved across Tally syncs')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getAllByText('+91 94150 99999').length).toBeGreaterThanOrEqual(1);
  });

  it('adds and deletes local contact numbers with persistence', async () => {
    renderComponent('p-sample');

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    // Open Details sheet
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    await waitFor(() => {
      expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
    });

    // Click "Add Number"
    fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));

    const input = screen.getByPlaceholderText('+91 98140 00000');
    fireEvent.change(input, { target: { value: '+91 99988 77766' } });

    // Click "Add" button inside the add form
    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    fireEvent.click(addButtons[addButtons.length - 1]!);

    // New local contact appears in list
    await waitFor(() => {
      expect(screen.getByText('+91 99988 77766')).toBeInTheDocument();
    });

    // Direct Call and WhatsApp buttons exist for this local contact
    expect(screen.getByLabelText('Call +91 99988 77766')).toHaveAttribute('href', 'tel:+919998877766');
    expect(screen.getByLabelText('WhatsApp +91 99988 77766')).toHaveAttribute('href', 'https://wa.me/919998877766');

    // Delete the local contact number
    const deleteButton = screen.getByLabelText('Delete +91 99988 77766');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('+91 99988 77766')).not.toBeInTheDocument();
    });
  });

  it('allows selecting destination phone number (including local numbers) in send reminder sheet', async () => {
    await mockApiClient.parties.update('p-sample', {
      phones: ['+91 98390 12345'],
      customPhones: ['+91 91234 56789'],
    });

    renderComponent('p-sample');

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    // Click "Send reminder" button
    fireEvent.click(screen.getByRole('button', { name: /Send reminder/i }));

    await waitFor(() => {
      expect(screen.getByText('Send Payment Reminder')).toBeInTheDocument();
      expect(screen.getByText('Send to')).toBeInTheDocument();
    });

    // Both Tally Master and Local Contact numbers are available in selection
    expect(screen.getAllByText('Tally Master').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Local Contact').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+91 91234 56789').length).toBeGreaterThanOrEqual(1);

    // Select the local number
    fireEvent.click(screen.getAllByText('+91 91234 56789')[0]!);

    // Send via WhatsApp button is enabled and ready
    expect(screen.getByRole('button', { name: /Send via WhatsApp/i })).toBeInTheDocument();
  });

  it('for a supplier/creditor party: displays Supplier badge, You owe amount, and disables reminder triggers', async () => {
    await mockApiClient.parties.create({
      id: 'p-creditor-detail-test',
      tenantId: 'tenant-1',
      companyId: 'c1',
      name: 'Shree Krishna Yarns (Supplier)',
      city: 'Surat',
      phones: ['+91 98250 11111'],
      customPhones: ['+91 98250 22222'],
      parentGroup: 'Sundry Creditors',
      partyType: 'creditor',
      creditDays: 45,
      closingBalance: 785000,
    });

    renderComponent('p-creditor-detail-test');

    await waitFor(() => {
      expect(screen.getByText('Shree Krishna Yarns (Supplier)')).toBeInTheDocument();
      expect(screen.getByText('Payable (You owe)')).toBeInTheDocument();
      expect(screen.getByText('Sundry Creditor (Supplier)')).toBeInTheDocument();
      expect(screen.getByText('Supplier account · Reminders disabled')).toBeInTheDocument();
    });

    // Send reminder button MUST be disabled / completely hidden for suppliers
    expect(screen.queryByRole('button', { name: /Send reminder/i })).not.toBeInTheDocument();
  });
});
