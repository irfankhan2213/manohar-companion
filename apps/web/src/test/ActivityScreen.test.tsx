import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ActivityScreen } from '../features/activity/ActivityScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';

describe('ActivityScreen Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <ActivityScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders Activity Log with seeded events and actors', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Activity Log')).toBeInTheDocument();
      expect(screen.getByText(/DC\/042\/26-27/i)).toBeInTheDocument();
      expect(screen.getByText(/Office PC synced 34 ledgers/i)).toBeInTheDocument();
    });
  });

  it('filters activity by action category (Sync)', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/DC\/042\/26-27/i)).toBeInTheDocument();
    });

    // Click 'Sync' category filter
    const syncTab = screen.getByText('Sync');
    fireEvent.click(syncTab);

    await waitFor(() => {
      expect(screen.getByText(/Office PC synced 34 ledgers/i)).toBeInTheDocument();
      expect(screen.queryByText(/Sample Garments Pvt Ltd \(₹1,05,840\)/i)).not.toBeInTheDocument();
    });
  });

  it('filters activity by device badge', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Office PC synced 34 ledgers/i)).toBeInTheDocument();
    });

    // Click 'Desktop' device filter button
    const desktopFilter = screen.getByRole('button', { name: 'Desktop' });
    fireEvent.click(desktopFilter);

    await waitFor(() => {
      // Desktop event should be visible
      expect(screen.getByText(/WhatsApp payment reminder sent to Sample Garments/i)).toBeInTheDocument();
      // Agent event should not be visible
      expect(screen.queryByText(/Office PC synced 34 ledgers/i)).not.toBeInTheDocument();
    });
  });
});
