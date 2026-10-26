import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SettingsScreen } from '../features/settings/SettingsScreen.js';
import { UserAuthMenu } from '../components/ui/UserAuthMenu.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';
import { INITIAL_USERS } from '@saas/shared';
import { useAppStore } from '../app/store.js';

describe('Authentication, Roles & Company Customization', () => {
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
    const owner = INITIAL_USERS.find((u) => u.role === 'owner')!;
    useAppStore.getState().setUser(owner);
  });

  const renderWithProviders = (ui: React.ReactElement) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>{ui}</BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders UserAuthMenu with current staff name and role badge', () => {
    renderWithProviders(<UserAuthMenu />);
    expect(screen.getByLabelText('Staff account menu')).toBeInTheDocument();
    expect(screen.getByText('Manohar')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('opens account sheet and verifies user details without prototype profile switcher', async () => {
    renderWithProviders(<UserAuthMenu />);

    // Click profile button to open sheet
    fireEvent.click(screen.getByLabelText('Staff account menu'));
    expect(screen.getByText('Account & Profile')).toBeInTheDocument();
    expect(screen.getByText('Manohar Lal')).toBeInTheDocument();
    expect(screen.getByText('Account & Organization Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();

    // Verify prototype switcher is completely absent
    expect(screen.queryByText('Switch Active Staff Profile')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset Profile to Owner')).not.toBeInTheDocument();
  });

  it('renders Organization & Company Setup and Role Permissions matrix in Settings', async () => {
    renderWithProviders(<SettingsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Organization & Company Setup')).toBeInTheDocument();
      expect(screen.getByText('+ Add Company')).toBeInTheDocument();
      expect(screen.getByText('Role Permissions & Access Control')).toBeInTheDocument();
    });

    // Test clicking Edit company
    const editBtns = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Edit'));
    if (editBtns[0]) fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Edit Organization Details');
      expect(document.body.textContent).toContain('Company / Business Name');
    });
  });
});
