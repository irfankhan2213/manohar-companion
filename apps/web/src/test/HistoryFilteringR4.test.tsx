import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';

describe('R4: Past Challans and Bills History Filtering by Party & Date Range', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>{ui}</BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('R4.1: ChallansScreen filters challans by selected party (person) and clears filter', async () => {
    renderWithProviders(<ChallansScreen />);

    // Initial load: multiple challans visible
    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument(); // Sample Garments
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument(); // Bharat Textiles
    });

    // Open filter sheet
    const filterBtn = screen.getByLabelText('Filter Challans');
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter by Party')).toBeInTheDocument();
    });

    // Select "Bharat Textiles"
    const partySelect = screen.getByLabelText('Filter by Party');
    fireEvent.change(partySelect, { target: { value: 'p-bharat' } });

    // Apply filters
    fireEvent.click(screen.getByText('Apply Filters'));

    // Only Bharat Textiles challan remains
    await waitFor(() => {
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
      expect(screen.queryByText('DC/042/26-27')).not.toBeInTheDocument();
    });

    // Active filter chip is rendered
    expect(screen.getByText(/Party: Bharat Textiles/i)).toBeInTheDocument();

    // Click clear on party chip
    const clearPartyBtn = screen.getByLabelText('Clear party filter');
    fireEvent.click(clearPartyBtn);

    // All challans restored
    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
    });
  });

  it('R4.1: ChallansScreen filters challans by date range (From Date & To Date)', async () => {
    renderWithProviders(<ChallansScreen />);

    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument(); // 2026-10-15
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument(); // 2026-10-16
    });

    // Open filter sheet
    fireEvent.click(screen.getByLabelText('Filter Challans'));

    await waitFor(() => {
      expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    });

    // Set date range strictly for 2026-10-16
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-10-16' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-10-16' } });

    // Apply
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
      expect(screen.queryByText('DC/042/26-27')).not.toBeInTheDocument();
    });

    // Date range chip rendered
    expect(screen.getByText('2026-10-16 → 2026-10-16')).toBeInTheDocument();

    // Clear date filter
    fireEvent.click(screen.getByLabelText('Clear date filter'));

    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
    });
  });

  it('R4.2: CollectionsScreen switches to Bills History view and lists past bills', async () => {
    renderWithProviders(<CollectionsScreen />);

    // In default Receivables view
    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    // Switch to Bills History view
    const billsTab = screen.getByRole('button', { name: 'Bills History' });
    fireEvent.click(billsTab);

    // Displays bills search bar and bill rows
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search bill # or party name...')).toBeInTheDocument();
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
      expect(screen.getByText('GST/014/26-27')).toBeInTheDocument();
    });
  });

  it('R4.2: CollectionsScreen filters Bills History by text search, party and date range', async () => {
    renderWithProviders(<CollectionsScreen />);

    // Switch to Bills History view
    fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search bill # or party name...')).toBeInTheDocument();
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
    });

    // Filter by text search: 'Bharat'
    const searchInput = screen.getByPlaceholderText('Search bill # or party name...');
    fireEvent.change(searchInput, { target: { value: 'Bharat' } });

    await waitFor(() => {
      expect(screen.getByText('GST/014/26-27')).toBeInTheDocument();
      expect(screen.queryByText('GST/004/26-27')).not.toBeInTheDocument();
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
    });

    // Open filter sheet for Bills History
    const filterBtn = screen.getByLabelText('Filter Bills');
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('Filter Bills by Party')).toBeInTheDocument();
    });

    // Filter by party: Sample Garments
    fireEvent.change(screen.getByLabelText('Filter Bills by Party'), { target: { value: 'p-sample' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
      expect(screen.queryByText('GST/014/26-27')).not.toBeInTheDocument();
    });

    // Active chip rendered
    expect(screen.getByText(/Party: Sample Garments Pvt Ltd/i)).toBeInTheDocument();
  });

  it('R4.3: PartyDetailScreen Bills tab filters bills by date range', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/collections/p-sample']}>
            <Routes>
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Party bills load on default Bills tab
    await waitFor(() => {
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument(); // date: 2026-08-01
      expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    });

    // Filter with date range that does NOT match 2026-08-01 (e.g. 2026-09-01 to 2026-09-30)
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-09-30' } });

    await waitFor(() => {
      expect(screen.queryByText('GST/004/26-27')).not.toBeInTheDocument();
      expect(screen.getByText('No bills match the selected date range.')).toBeInTheDocument();
    });

    // Clear dates
    const clearDatesBtn = screen.getByText('Clear Dates');
    fireEvent.click(clearDatesBtn);

    // Bill restored
    await waitFor(() => {
      expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
    });
  });
});
