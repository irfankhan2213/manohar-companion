import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { HomeScreen } from '../features/home/HomeScreen.js';
import '../i18n/index.js';

describe('HomeScreen Component', () => {
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
        <BrowserRouter>
          <HomeScreen />
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders the receivables hero amount and overdue indicator', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('₹18,42,300')).toBeInTheDocument();
      expect(screen.getByText('₹6,10,200 is overdue')).toBeInTheDocument();
    });
  });

  it('renders the Needs Attention section items', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Needs attention')).toBeInTheDocument();
      expect(screen.getByText('2 customer replies waiting')).toBeInTheDocument();
    });
  });

  it('renders Most Overdue customers with correct amounts', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.getByText('₹1,32,300')).toBeInTheDocument();
      expect(screen.getByText('45 days late')).toBeInTheDocument();
    });
  });

  it('hides send reminder button and shows view dues button when whatsapp is not attached', async () => {
    renderComponent();

    await waitFor(() => {
      // Primary button and attention row show View dues, Send reminders is hidden
      expect(screen.getAllByText(/view dues/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/send reminders/i)).not.toBeInTheDocument();
    });
  });

  it('strictly excludes Sundry Creditors from customers owe you receivables and most overdue list', async () => {
    const { mockApiClient, resetMockDB } = await import('../mock/db.js');
    resetMockDB();

    // Add a large supplier / creditor with a heavy overdue balance
    await mockApiClient.parties.create({
      id: 'p-creditor-home-test',
      tenantId: 'tenant-1',
      companyId: 'c1',
      name: 'Vardhman Supplier Corporation',
      city: 'Ludhiana',
      phones: ['+91 98111 22222'],
      parentGroup: 'Sundry Creditors',
      partyType: 'creditor',
      creditDays: 15,
      closingBalance: 99999999, // large payable
    });

    queryClient.clear();
    renderComponent();

    await waitFor(() => {
      // Total receivables must remain the reconciled customer dues (₹18,42,300) and NOT include creditor's 99999999
      expect(screen.getByText('₹18,42,300')).toBeInTheDocument();
      expect(screen.getByText('Customers owe you')).toBeInTheDocument();
    });

    // Supplier MUST NOT appear in the Most Overdue customer list
    expect(screen.queryByText('Vardhman Supplier Corporation')).not.toBeInTheDocument();
    expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
  });
});
