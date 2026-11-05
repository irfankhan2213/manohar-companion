import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { StockScreen } from '../features/stock/StockScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { useAppStore } from '../app/store.js';
import { INITIAL_USERS } from '@saas/shared';
import '../i18n/index.js';

describe('StockScreen Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const owner = INITIAL_USERS.find((u) => u.role === 'owner')!;
  useAppStore.getState().setUser(owner);

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <StockScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders stock items with quantities', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
      expect(screen.getByText('Rotary Hook Assembly (Japanese Type)')).toBeInTheDocument();
    });
  });

  it('filters stock items by low stock status', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
    });

    const lowStockTab = screen.getByRole('tab', { name: 'Low Stock' });
    fireEvent.click(lowStockTab);

    await waitFor(() => {
      // Rotary Hook (12 pcs <= reorder 15) is low stock
      expect(screen.getByText('Rotary Hook Assembly (Japanese Type)')).toBeInTheDocument();
    });
  });

  it('renders New Item button and allows opening create sheet with custom values', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Item')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Item'));

    expect(screen.getByText(/Create a new stock master for Tally & Cloud/i)).toBeInTheDocument();
  });
});
