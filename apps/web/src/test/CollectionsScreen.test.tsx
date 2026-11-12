import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';

describe('CollectionsScreen Component', () => {
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
            <CollectionsScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders Collections list with customer entries', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.getByText('Bharat Textiles')).toBeInTheDocument();
    });
  });

  it('filters customers via search input', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search customer or city');
    fireEvent.change(searchInput, { target: { value: 'Kanpur' } });

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.queryByText('Bharat Textiles')).not.toBeInTheDocument();
    });
  });

  it('toggles multi-select mode and triggers selection', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Select')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Select'));

    expect(screen.getByText('Done')).toBeInTheDocument();

    // Select Sample Garments
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));

    await waitFor(() => {
      expect(screen.getByText(/Send reminders \(1\)/)).toBeInTheDocument();
    });
  });

  it('differentiates debtors and creditors with segmented tabs, badges, amount labels and reminder protection', async () => {
    // Seed a supplier (creditor)
    const { mockApiClient } = await import('../mock/db.js');
    await mockApiClient.parties.create({
      id: 'p-supplier-test',
      tenantId: 'tenant-1',
      companyId: 'c1',
      name: 'Vardhman Thread Mills',
      city: 'Ludhiana',
      phones: ['+91 98111 88888'],
      parentGroup: 'Sundry Creditors',
      partyType: 'creditor',
      creditDays: 30,
      closingBalance: 450000,
    });

    queryClient.clear();
    renderComponent();

    // In default "Customers" tab: Customers appear with "Customer" badge and "Owes you"
    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.queryByText('Vardhman Thread Mills')).not.toBeInTheDocument();
    });

    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Owes you').length).toBeGreaterThan(0);
    expect(screen.getByText('Select')).toBeInTheDocument();

    // Switch to "Suppliers" tab
    fireEvent.click(screen.getByText('Suppliers'));

    await waitFor(() => {
      expect(screen.getByText('Vardhman Thread Mills')).toBeInTheDocument();
      expect(screen.queryByText('Sample Garments Pvt Ltd')).not.toBeInTheDocument();
    });

    // Supplier row displays "Supplier" badge and "You owe" amount label
    expect(screen.getByText('Supplier')).toBeInTheDocument();
    expect(screen.getByText('You owe')).toBeInTheDocument();

    // Reminder batch action (Select button) is disabled/hidden for suppliers
    expect(screen.queryByText('Select')).not.toBeInTheDocument();

    // Switch to "All" tab
    fireEvent.click(screen.getByText('All'));

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      expect(screen.getByText('Vardhman Thread Mills')).toBeInTheDocument();
    });

    // In All tab, both Customer and Supplier badges and labels exist
    expect(screen.getByText('Supplier')).toBeInTheDocument();
    expect(screen.getAllByText('Customer').length).toBeGreaterThan(0);
    expect(screen.getByText('You owe')).toBeInTheDocument();
    expect(screen.getAllByText('Owes you').length).toBeGreaterThan(0);

    // Multi-select in All tab blocks supplier selection
    expect(screen.getByText('Select')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select'));

    // Clicking supplier does not increment reminder queue
    fireEvent.click(screen.getByText('Vardhman Thread Mills'));
    expect(screen.queryByText(/Send reminders/)).not.toBeInTheDocument();

    // Clicking customer works
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
    await waitFor(() => {
      expect(screen.getByText(/Send reminders \(1\)/)).toBeInTheDocument();
    });
  });
});
