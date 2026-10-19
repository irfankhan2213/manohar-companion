import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { RemindersScreen } from '../features/reminders/RemindersScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
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
});
