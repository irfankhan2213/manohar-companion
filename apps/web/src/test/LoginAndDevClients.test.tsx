import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { LoginScreen } from '../features/auth/LoginScreen.js';
import { DevClientsScreen } from '../features/dev/DevClientsScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';
import { useAppStore } from '../app/store.js';

describe('Login and Dev Clients Screens', () => {
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
    useAppStore.getState().logout();
  });

  const renderLogin = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <LoginScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  const renderDevClients = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <DevClientsScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders LoginScreen with form controls and quick demo buttons', async () => {
    renderLogin();

    expect(screen.getByText('Manohar Companion')).toBeInTheDocument();
    expect(screen.getByText('Registered Phone Number')).toBeInTheDocument();
    expect(screen.getByText('4-Digit PIN')).toBeInTheDocument();
    expect(screen.getByText('Stay signed in on this device')).toBeInTheDocument();
    expect(screen.getByText('Quick 1-Tap Demo Accounts')).toBeInTheDocument();

    // Check quick pills
    expect(screen.getByText('Dev Super Admin')).toBeInTheDocument();
    expect(screen.getByText('Manohar Lal')).toBeInTheDocument();
  });

  it('populates fields when a quick demo login button is tapped', async () => {
    renderLogin();

    const devPill = screen.getByText('Dev Super Admin');
    fireEvent.click(devPill);

    const phoneInput = screen.getByDisplayValue('+91 99999 00000');
    expect(phoneInput).toBeInTheDocument();

    const pinInput = screen.getByDisplayValue('0000');
    expect(pinInput).toBeInTheDocument();
  });

  it('submits login and signs the user into store', async () => {
    renderLogin();

    const devPill = screen.getByText('Dev Super Admin');
    fireEvent.click(devPill);

    const signInBtn = screen.getByRole('button', { name: /Sign In/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(useAppStore.getState().authToken).toBeTruthy();
      expect(useAppStore.getState().currentUser?.role).toBe('dev');
    });
  });

  it('renders DevClientsScreen and opens Onboard New Client sheet', async () => {
    useAppStore.getState().setUser({
      id: 'u-dev',
      name: 'Platform Dev Admin',
      phone: '+91 99999 00000',
      role: 'dev',
      companyIds: ['c1'],
      active: true,
      tenantId: 'tenant-1',
    });

    renderDevClients();

    await waitFor(() => {
      expect(screen.getByText('Client Organizations')).toBeInTheDocument();
    });

    const onboardBtn = screen.getByRole('button', { name: /\+ Onboard Client/i });
    fireEvent.click(onboardBtn);

    await waitFor(() => {
      expect(screen.getByText('Onboard New Client')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Ludhiana Woolens')).toBeInTheDocument();
    });
  });
});
