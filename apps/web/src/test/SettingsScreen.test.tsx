import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SettingsScreen } from '../features/settings/SettingsScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';
import { useAppStore } from '../app/store.js';

describe('SettingsScreen Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    useAppStore.getState().setLanguage('en');
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <SettingsScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders Settings with Office PC status and pairing code', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Office PC (Windows Agent)')).toBeInTheDocument();
      expect(screen.getByText('839201')).toBeInTheDocument();
      expect(screen.getByText('Sync Tally Now')).toBeInTheDocument();
    });
  });

  it('triggers manual Tally sync with toast notification', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Sync Tally Now')).toBeInTheDocument();
    });

    const syncBtn = screen.getByText('Sync Tally Now');
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tally sync complete/i)).toBeInTheDocument();
    });
  });

  it('toggles language between English and Hindi reactively', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('App Language')).toBeInTheDocument();
    });

    // Click Hindi button
    const hindiBtn = screen.getByText('हिंदी');
    fireEvent.click(hindiBtn);

    await waitFor(() => {
      expect(screen.getByText('ऐप की भाषा')).toBeInTheDocument();
      expect(screen.getByText('सेटिंग्स')).toBeInTheDocument();
      expect(screen.getByText('कर्मचारी और भूमिका प्रबंधन')).toBeInTheDocument();
    });

    // Toggle back to English
    const englishBtn = screen.getByText('English');
    fireEvent.click(englishBtn);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('App Language')).toBeInTheDocument();
    });
  });

  it('inspects and customizes user permissions and custom role sheet', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('Manohar Lal').length).toBeGreaterThan(0);
    });

    const userRow = screen.getAllByText('Manohar Lal')[1] || screen.getAllByText('Manohar Lal')[0]!;
    fireEvent.click(userRow);

    await waitFor(() => {
      expect(screen.getByText('Protected Staff Account')).toBeInTheDocument();
      expect(screen.getByText('View Executive Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Save Staff Changes')).toBeInTheDocument();
    });

    // Save changes
    fireEvent.click(screen.getByText('Save Staff Changes'));
  });
});
