import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import '../i18n/index.js';

describe('ChallansScreen Component', () => {
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
          <ChallansScreen />
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('renders seeded challans with voucher numbers and queue statuses', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
      expect(screen.getByText('PC/008/26-27')).toBeInTheDocument();
    });

    // Check status badges
    expect(screen.getAllByText('Updated in Tally').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Waiting for Tally').length).toBeGreaterThan(0);
    expect(screen.getAllByText("Couldn't update").length).toBeGreaterThan(0);
  });

  it('filters challans by type when tab is clicked', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
    });

    // Switch to Sales tab
    const salesTab = screen.getByRole('tab', { name: 'Sales' });
    fireEvent.click(salesTab);

    await waitFor(() => {
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
      expect(screen.queryByText('DC/042/26-27')).not.toBeInTheDocument();
      expect(screen.queryByText('PC/008/26-27')).not.toBeInTheDocument();
    });
  });

  it('filters challans via search query', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search voucher #, party, vehicle...');
    fireEvent.change(searchInput, { target: { value: 'Bharat' } });

    await waitFor(() => {
      // Bharat Textiles challan
      expect(screen.getByText('SC/014/26-27')).toBeInTheDocument();
      expect(screen.queryByText('PC/008/26-27')).not.toBeInTheDocument();
    });
  });
});
