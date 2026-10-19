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
});
