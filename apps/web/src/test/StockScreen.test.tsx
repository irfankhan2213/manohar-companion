import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { StockScreen } from '../features/stock/StockScreen.js';
import '../i18n/index.js';

describe('StockScreen Component', () => {
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
          <StockScreen />
        </BrowserRouter>
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
      expect(screen.getByText('All Items')).toBeInTheDocument();
    });

    const lowStockTab = screen.getByRole('tab', { name: 'Low Stock' });
    fireEvent.click(lowStockTab);

    await waitFor(() => {
      // Rotary Hook (12 pcs <= reorder 15) is low stock
      expect(screen.getByText('Rotary Hook Assembly (Japanese Type)')).toBeInTheDocument();
    });
  });
});
