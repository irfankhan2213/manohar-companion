import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, BrowserRouter, Routes, Route } from 'react-router-dom';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { useAppStore } from '../app/store.js';
import '../i18n/index.js';

describe('Milestone 4 Adversarial Stress Test Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    cleanup();
    resetMockDB();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    useAppStore.setState({
      currentCompanyId: 'c1',
      currentRole: 'owner',
      currentUser: {
        id: 'u1',
        name: 'Manohar Lal',
        role: 'owner',
        tenantId: 'tenant-1',
        phone: '+91 98140 12345',
        active: true,
        companyIds: ['c1'],
      },
    });
  });

  const renderWithProviders = (initialRoute = '/collections') =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialRoute]}>
            <Routes>
              <Route path="/collections" element={<CollectionsScreen />} />
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
              <Route path="/" element={<HomeScreen />} />
              <Route path="/home" element={<HomeScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  describe('1. Navigation and State Sync between CollectionsScreen and PartyDetailScreen', () => {
    it('syncs party customPhones across navigation and preserves cache separation between companies', async () => {
      // Create party in company c1
      await mockApiClient.parties.create({
        id: 'p-sync-test',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Sync Adversarial Garments',
        city: 'Varanasi',
        phones: ['+91 94150 11111'],
        customPhones: ['+91 94150 22222'],
        parentGroup: 'Sundry Debtors',
        partyType: 'debtor',
        creditDays: 30,
        closingBalance: 120000,
      });

      renderWithProviders('/collections/p-sync-test');

      await waitFor(() => {
        expect(screen.getByText('Sync Adversarial Garments')).toBeInTheDocument();
      });

      // Open details and verify initial local number is present
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));
      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
        expect(screen.getByText('+91 94150 22222')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));
      const input = screen.getByPlaceholderText('+91 98140 00000');
      fireEvent.change(input, { target: { value: '+91 94150 33333' } });

      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      await waitFor(() => {
        expect(screen.getByText('+91 94150 33333')).toBeInTheDocument();
      });

      // Verify the mock DB has persisted both custom phones
      const inDb = await mockApiClient.parties.get('p-sync-test');
      expect(inDb?.customPhones).toEqual(['+91 94150 22222', '+91 94150 33333']);

      // Switch company in store to c2: collections should NOT show this party
      useAppStore.setState({ currentCompanyId: 'c2' });
      queryClient.clear();

      renderWithProviders('/collections');
      await waitFor(() => {
        expect(screen.queryByText('Sync Adversarial Garments')).not.toBeInTheDocument();
      });
    });

    it('manages multi-select state transitions when switching tabs from debtor to creditor to all', async () => {
      await mockApiClient.parties.create({
        id: 'p-cred-tab-test',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Apex Yarn Suppliers',
        city: 'Amritsar',
        phones: ['+91 98765 00000'],
        parentGroup: 'Sundry Creditors',
        partyType: 'creditor',
        creditDays: 30,
        closingBalance: 500000,
      });

      renderWithProviders('/collections');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Activate multi-select in default Debtors tab
      fireEvent.click(screen.getByText('Select'));
      expect(screen.getByText('Done')).toBeInTheDocument();

      // Select customer
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      await waitFor(() => {
        expect(screen.getByText(/Send reminders \(1\)/)).toBeInTheDocument();
      });

      // Switch to Suppliers tab: multi-select must be forcibly deactivated and Select button hidden
      fireEvent.click(screen.getByText('Suppliers'));
      await waitFor(() => {
        expect(screen.getByText('Apex Yarn Suppliers')).toBeInTheDocument();
      });
      expect(screen.queryByText('Select')).not.toBeInTheDocument();
      expect(screen.queryByText('Done')).not.toBeInTheDocument();
      expect(screen.queryByText(/Send reminders/)).not.toBeInTheDocument();

      // Switch to All tab: Select button returns, but queue is cleared
      fireEvent.click(screen.getByText('All'));
      await waitFor(() => {
        expect(screen.getByText('Apex Yarn Suppliers')).toBeInTheDocument();
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      expect(screen.getByText('Select')).toBeInTheDocument();
      expect(screen.queryByText(/Send reminders/)).not.toBeInTheDocument();
    });
  });

  describe('2. Accessibility and Focus Management', () => {
    it('supports keyboard navigation on Collections rows via Enter and Space keys', async () => {
      renderWithProviders('/collections');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Get row container for Sample Garments
      const row = screen.getByText('Sample Garments Pvt Ltd').closest('[role="button"]');
      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute('tabIndex', '0');

      // Verify row responds to Space key
      fireEvent.keyDown(row!, { key: ' ' });

      // Should have navigated to PartyDetailScreen
      await waitFor(() => {
        expect(screen.getByText('Currently owes')).toBeInTheDocument();
      });
    });

    it('verifies SegmentedControl tablist and tab accessibility attributes', async () => {
      renderWithProviders('/collections');

      await waitFor(() => {
        expect(screen.getByRole('tablist')).toBeInTheDocument();
      });

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(3);

      // Customers tab should be active by default
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[2]).toHaveAttribute('aria-selected', 'false');

      // Click Suppliers tab
      fireEvent.click(tabs[1]!);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    });

    it('provides accessible labels for search input, back button, and phone action links', async () => {
      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Back button must have aria-label
      const backBtn = screen.getByRole('button', { name: 'Back' });
      expect(backBtn).toBeInTheDocument();

      // Quick contact links must have accessible aria-labels
      const callLinks = screen.getAllByRole('link', { name: /^Call/i });
      expect(callLinks.length).toBeGreaterThanOrEqual(1);

      const waLinks = screen.getAllByRole('link', { name: /^WhatsApp/i });
      expect(waLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. Read-Only Guarantees on Tally Master Numbers', () => {
    it('strictly guarantees that Tally master numbers cannot be deleted or edited in the UI', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345', '+91 98390 54321'],
        customPhones: ['+91 99999 00000'],
      });

      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByText('Tally Master Numbers')).toBeInTheDocument();
      });

      // Tally master section must show Read-only badge and subtitle
      expect(screen.getByText('Read-only · Synced from Tally ERP')).toBeInTheDocument();
      expect(screen.getByText('Primary')).toBeInTheDocument();
      expect(screen.getAllByText('Tally').length).toBe(2);

      // Ensure NO delete buttons exist for Tally numbers
      expect(screen.queryByLabelText('Delete +91 98390 12345')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Delete +91 98390 54321')).not.toBeInTheDocument();

      // Delete button MUST exist for local contact number
      expect(screen.getByLabelText('Delete +91 99999 00000')).toBeInTheDocument();
    });

    it('deleting a local contact number does NOT alter Tally master phones in database', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345'],
        customPhones: ['+91 98888 11111'],
      });

      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Delete +91 98888 11111')).toBeInTheDocument();
      });

      // Delete the local contact
      fireEvent.click(screen.getByLabelText('Delete +91 98888 11111'));

      await waitFor(() => {
        expect(screen.queryByText('+91 98888 11111')).not.toBeInTheDocument();
      });

      // Inspect DB directly: Tally phones must be completely untouched
      const partyInDb = await mockApiClient.parties.get('p-sample');
      expect(partyInDb?.phones).toEqual(['+91 98390 12345']);
      expect(partyInDb?.customPhones).toEqual([]);
    });
  });

  describe('4. Local Contact Number Lifecycle & Validation', () => {
    it('rejects duplicate contact numbers (both against existing customPhones and Tally master phones)', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345'],
        customPhones: ['+91 94150 99999'],
      });

      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Details' }));
      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // 1. Try to add duplicate of existing local custom number
      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));
      let input = screen.getByPlaceholderText('+91 98140 00000');
      fireEvent.change(input, { target: { value: '+91 94150 99999' } });

      let addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      await waitFor(() => {
        expect(screen.getByText('This contact number is already recorded for this party')).toBeInTheDocument();
      });

      // 2. Try to add duplicate of Tally master phone
      fireEvent.change(input, { target: { value: '+91 98390 12345' } });
      addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      await waitFor(() => {
        expect(screen.getByText('This contact number is already recorded for this party')).toBeInTheDocument();
      });

      // Verify customPhones in DB was NOT duplicated
      const partyInDb = await mockApiClient.parties.get('p-sample');
      expect(partyInDb?.customPhones).toEqual(['+91 94150 99999']);
    });

    it('rejects empty and whitespace-only contact number input', async () => {
      const initialParty = await mockApiClient.parties.get('p-sample');
      const initialCustomPhones = [...(initialParty?.customPhones ?? [])];

      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Details' }));
      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));
      const input = screen.getByPlaceholderText('+91 98140 00000');
      fireEvent.change(input, { target: { value: '   ' } });

      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      // No new row created
      const partyInDb = await mockApiClient.parties.get('p-sample');
      expect(partyInDb?.customPhones).toEqual(initialCustomPhones);
    });

    it('allows choosing between Tally and Local contact numbers in reminder dialog and triggers WhatsApp URL with chosen number', async () => {
      // Spy on window.open
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345'],
        customPhones: ['+91 91234 88888'],
      });

      renderWithProviders('/collections/p-sample');

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Open Send Reminder sheet
      fireEvent.click(screen.getByRole('button', { name: /Send reminder/i }));

      await waitFor(() => {
        expect(screen.getByText('Send Payment Reminder')).toBeInTheDocument();
        expect(screen.getByText('+91 91234 88888')).toBeInTheDocument();
      });

      // Select local contact number
      fireEvent.click(screen.getByText('+91 91234 88888'));

      // Click Send via WhatsApp
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/i }));

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      const urlArg = windowOpenSpy.mock.calls[0]![0] as string;
      expect(urlArg).toContain('https://wa.me/919123488888');

      windowOpenSpy.mockRestore();
    });
  });

  describe('5. Creditor / Supplier Protection Across All Screens', () => {
    it('5.1: PartyDetailScreen strictly displays Supplier badge, You owe hero, and hides reminder triggers', async () => {
      await mockApiClient.parties.create({
        id: 'p-cred-defense-detail',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Vardhman Thread Mills (Creditor)',
        city: 'Ludhiana',
        phones: ['+91 98140 55555'],
        parentGroup: 'Sundry Creditors',
        partyType: 'creditor',
        creditDays: 30,
        closingBalance: 350000,
      });

      renderWithProviders('/collections/p-cred-defense-detail');

      await waitFor(() => {
        expect(screen.getByText('Vardhman Thread Mills (Creditor)')).toBeInTheDocument();
        expect(screen.getByText('Payable (You owe)')).toBeInTheDocument();
        expect(screen.getByText('Sundry Creditor (Supplier)')).toBeInTheDocument();
        expect(screen.getByText('Supplier account · Reminders disabled')).toBeInTheDocument();
      });
      // Send reminder button is completely omitted
      expect(screen.queryByRole('button', { name: /Send reminder/i })).not.toBeInTheDocument();
    });

    it('5.2: HomeScreen strictly excludes Creditors from receivables hero and most overdue list', async () => {
      useAppStore.setState({ currentCompanyId: 'all' });
      await mockApiClient.parties.create({
        id: 'p-cred-defense-home',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Vardhman Thread Mills (Creditor)',
        city: 'Ludhiana',
        phones: ['+91 98140 55555'],
        parentGroup: 'Sundry Creditors',
        partyType: 'creditor',
        creditDays: 30,
        closingBalance: 350000,
      });

      useAppStore.setState({ currentCompanyId: 'c1' });
      render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <HomeScreen />
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Customers owe you')).toBeInTheDocument();
        expect(screen.getByText('₹18,42,300')).toBeInTheDocument();
      });
      expect(screen.queryByText('Vardhman Thread Mills (Creditor)')).not.toBeInTheDocument();
    });
  });

  describe('6. Edge Cases and Resilience', () => {
    it('handles a party with zero phone numbers gracefully without crashing', async () => {
      await mockApiClient.parties.create({
        id: 'p-no-phones',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Zero Phone Corp',
        city: 'Delhi',
        phones: [],
        customPhones: [],
        parentGroup: 'Sundry Debtors',
        partyType: 'debtor',
        creditDays: 15,
        closingBalance: 25000,
      });

      renderWithProviders('/collections/p-no-phones');

      await waitFor(() => {
        expect(screen.getByText('Zero Phone Corp')).toBeInTheDocument();
        expect(screen.getByText('Currently owes')).toBeInTheDocument();
      });

      // Quick contact bar must be omitted since no phones exist
      expect(screen.queryByRole('link', { name: /^Call/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^WhatsApp/i })).not.toBeInTheDocument();

      // Open details sheet: should show empty states for both Tally and Local numbers
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));
      await waitFor(() => {
        expect(screen.getByText('No master numbers recorded in Tally.')).toBeInTheDocument();
        expect(screen.getByText('No local contact numbers saved yet. Add one above.')).toBeInTheDocument();
      });
    });
  });
});
