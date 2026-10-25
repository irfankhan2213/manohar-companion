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

  it('switches staff user and verifies PIN when elevating to owner', async () => {
    renderWithProviders(<UserAuthMenu />);

    // Click profile button to open sheet
    fireEvent.click(screen.getByLabelText('Staff account menu'));
    expect(screen.getByText('Staff Profile & Security')).toBeInTheDocument();
    expect(screen.getByText('Switch Active Staff Profile')).toBeInTheDocument();

    // Wait for staff list to load and select Suresh (Stock Keeper)
    await waitFor(() => {
      expect(screen.getByText('Suresh Kumar')).toBeInTheDocument();
    });

    const sureshButton = screen.getByText('Suresh Kumar').closest('button');
    expect(sureshButton).toBeInTheDocument();
    fireEvent.click(sureshButton!);

    expect(useAppStore.getState().currentUser?.name).toBe('Suresh Kumar');
    expect(useAppStore.getState().currentUser?.role).toBe('stock_keeper');

    // 2. Re-open and switch back to Manohar Lal (Owner) - requires PIN
    fireEvent.click(screen.getByLabelText('Staff account menu'));
    await waitFor(() => {
      expect(screen.getByText('Manohar Lal')).toBeInTheDocument();
    });
    const manoharButton = screen.getByText('Manohar Lal').closest('button');
    fireEvent.click(manoharButton!);

    // PIN prompt
    expect(screen.getByText('Enter 4-Digit Security PIN')).toBeInTheDocument();
    const pinInput = screen.getByPlaceholderText('••••');
    fireEvent.change(pinInput, { target: { value: '1234' } });

    // Verify & Switch
    fireEvent.click(screen.getByText('Verify & Switch'));

    expect(useAppStore.getState().currentUser?.name).toBe('Manohar Lal');
    expect(useAppStore.getState().currentUser?.role).toBe('owner');
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
