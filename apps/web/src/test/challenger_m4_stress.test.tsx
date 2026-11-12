import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { HomeScreen } from '../features/home/HomeScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { useAppStore } from '../app/store.js';
import '../i18n/index.js';

describe('Milestone 4 Adversarial Empirical Stress Test Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMockDB();
    useAppStore.setState({
      currentUser: null,
      currentRole: 'owner',
      currentCompanyId: 'c1',
    });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderCollections = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/collections']}>
            <Routes>
              <Route path="/collections" element={<CollectionsScreen />} />
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  const renderPartyDetail = (partyId: string) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/collections/${partyId}`]}>
            <Routes>
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  const renderHome = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/collections" element={<CollectionsScreen />} />
              <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  // =========================================================================
  // 1. PARTY DIFFERENTIATION & CREDITOR PROTECTION
  // =========================================================================
  describe('Dimension 1: Party Differentiation & Creditor Protection', () => {
    it('1.1: Segregates Debtors and Creditors into tabs and applies semantic badges and amount labels', async () => {
      // Seed an explicit creditor and a creditor identified by parentGroup/notes
      await mockApiClient.parties.create({
        id: 'p-cred-1',
        name: 'Oswal Woollen Mills',
        city: 'Ludhiana',
        phones: ['+91 98111 11111'],
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 1250000,
      });

      await mockApiClient.parties.create({
        id: 'p-cred-notes',
        name: 'Vardhman Polytex (Creditor)',
        city: 'Amritsar',
        phones: ['+91 98111 22222'],
        parentGroup: 'Raw Material Creditors',
        notes: 'Primary yarn supplier / creditor',
        closingBalance: 850000,
      });

      renderCollections();

      // In default "Customers" tab: Customers appear, Creditors MUST NOT appear
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
        expect(screen.queryByText('Oswal Woollen Mills')).not.toBeInTheDocument();
        expect(screen.queryByText('Vardhman Polytex (Creditor)')).not.toBeInTheDocument();
      });

      // Verify customer row badges and semantic labels
      expect(screen.getAllByText('Customer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Owes you').length).toBeGreaterThanOrEqual(1);

      // Switch to "Suppliers" tab
      fireEvent.click(screen.getByText('Suppliers'));

      await waitFor(() => {
        expect(screen.getByText('Oswal Woollen Mills')).toBeInTheDocument();
        expect(screen.getByText('Vardhman Polytex (Creditor)')).toBeInTheDocument();
        expect(screen.queryByText('Sample Garments Pvt Ltd')).not.toBeInTheDocument();
      });

      // Verify supplier row badges and semantic labels
      expect(screen.getAllByText('Supplier').length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText('You owe').length).toBeGreaterThanOrEqual(2);

      // Switch to "All" tab: both appear simultaneously with appropriate semantic labels
      fireEvent.click(screen.getByText('All'));

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
        expect(screen.getByText('Oswal Woollen Mills')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Customer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Supplier').length).toBeGreaterThanOrEqual(2);
    });

    it('1.2: Suppresses batch reminder "Select" button on Suppliers tab and auto-resets multi-select when switching tabs', async () => {
      await mockApiClient.parties.create({
        id: 'p-cred-tab',
        name: 'Nahar Industrial Enterprises',
        city: 'Ludhiana',
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 500000,
      });

      renderCollections();

      // In "Customers" tab, "Select" button is visible
      await waitFor(() => {
        expect(screen.getByText('Select')).toBeInTheDocument();
      });

      // Open multi-select in Customers tab
      fireEvent.click(screen.getByText('Select'));
      expect(screen.getByText('Done')).toBeInTheDocument();

      // Switch to "Suppliers" tab
      fireEvent.click(screen.getByText('Suppliers'));

      await waitFor(() => {
        expect(screen.getByText('Nahar Industrial Enterprises')).toBeInTheDocument();
      });

      // "Select" and "Done" buttons MUST be completely absent for suppliers
      expect(screen.queryByText('Select')).not.toBeInTheDocument();
      expect(screen.queryByText('Done')).not.toBeInTheDocument();
    });

    it('1.3: In "All" tab multi-select, clicking a creditor row is blocked with a descriptive toast and shows a Ban indicator', async () => {
      await mockApiClient.parties.create({
        id: 'p-cred-block',
        name: 'Trident Group (Supplier)',
        city: 'Barnala',
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 2400000,
      });

      renderCollections();

      // Switch to "All" tab
      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('All'));

      await waitFor(() => {
        expect(screen.getByText('Trident Group (Supplier)')).toBeInTheDocument();
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Turn on multi-select
      fireEvent.click(screen.getByText('Select'));
      expect(screen.getByText('Done')).toBeInTheDocument();

      // Creditor row should have Ban icon with title="Reminders disabled for suppliers"
      expect(screen.getAllByTitle('Reminders disabled for suppliers').length).toBeGreaterThanOrEqual(1);

      // Click on the supplier row
      fireEvent.click(screen.getByText('Trident Group (Supplier)'));

      // Toast should appear and supplier MUST NOT be added to selection
      await waitFor(() => {
        expect(screen.getByText('Payment reminders cannot be sent to suppliers')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Send reminders \(/)).not.toBeInTheDocument();

      // Clicking on customer works normally
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      await waitFor(() => {
        expect(screen.getByText(/Send reminders \(1\)/)).toBeInTheDocument();
      });
    });

    it('1.4: Batch reminders dispatch defensively filters out creditors even if forced into selection', async () => {
      const sendSpy = vi.spyOn(mockApiClient.reminders, 'send');

      await mockApiClient.parties.create({
        id: 'p-cred-malicious',
        name: 'Rico Auto Supplier',
        city: 'Gurgaon',
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 300000,
      });

      renderCollections();

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Click Select
      fireEvent.click(screen.getByText('Select'));

      // Select valid customer
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));

      await waitFor(() => {
        expect(screen.getByText(/Send reminders \(1\)/)).toBeInTheDocument();
      });

      // Click floating "Send reminders (1)" button to open confirmation sheet
      fireEvent.click(screen.getByText(/Send reminders \(1\)/));

      await waitFor(() => {
        expect(screen.getByText('Confirm and Queue')).toBeInTheDocument();
      });

      // Confirm dispatch
      fireEvent.click(screen.getByText('Confirm and Queue'));

      await waitFor(() => {
        expect(screen.getByText(/payment reminders queued for sending/i)).toBeInTheDocument();
      });

      // Verify that reminders.send was only called for debtor, never for any creditor
      expect(sendSpy).toHaveBeenCalledWith('p-sample');
      expect(sendSpy).not.toHaveBeenCalledWith('p-cred-malicious');
      sendSpy.mockRestore();
    });

    it('1.5: Creditor in PartyDetailScreen displays Supplier badge, You owe hero, and hides reminder triggers', async () => {
      await mockApiClient.parties.create({
        id: 'p-supplier-detail-stress',
        name: 'Apex Dyes & Chemicals',
        city: 'Ahmedabad',
        phones: ['+91 98250 99999'],
        customPhones: ['+91 98250 88888'],
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        creditDays: 60,
        closingBalance: 1450000,
      });

      renderPartyDetail('p-supplier-detail-stress');

      await waitFor(() => {
        expect(screen.getByText('Apex Dyes & Chemicals')).toBeInTheDocument();
        expect(screen.getByText('Ahmedabad')).toBeInTheDocument();
        expect(screen.getByText('Payable (You owe)')).toBeInTheDocument();
        expect(screen.getByText('Sundry Creditor (Supplier)')).toBeInTheDocument();
        expect(screen.getByText('Supplier account · Reminders disabled')).toBeInTheDocument();
      });

      // Send reminder button MUST be completely absent
      expect(screen.queryByRole('button', { name: /Send reminder/i })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. LOCAL CONTACT NUMBERS EDGE CASES & PERSISTENCE
  // =========================================================================
  describe('Dimension 2: Local Contact Numbers Validation & Persistence', () => {
    it('2.1: Rejects empty strings, whitespace-only, and trims input before adding', async () => {
      renderPartyDetail('p-sample');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));

      const input = screen.getByPlaceholderText('+91 98140 00000');
      const addBtn = screen.getAllByRole('button', { name: 'Add' }).slice(-1)[0]!;

      // Attempt 1: Empty string
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(addBtn);

      // Attempt 2: Spaces and tabs
      fireEvent.change(input, { target: { value: '    \t   ' } });
      fireEvent.click(addBtn);

      // Form remains open and no blank item added
      expect(screen.getByText('No local contact numbers saved yet. Add one above.')).toBeInTheDocument();

      // Attempt 3: Valid number with trailing/leading spaces
      fireEvent.change(input, { target: { value: '   +91 98765 43210   ' } });
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
      });

      // Verify party in DB now has trimmed customPhone
      const updatedParty = await mockApiClient.parties.get('p-sample');
      expect(updatedParty?.customPhones).toContain('+91 98765 43210');
    });

    it('2.2: Rejects duplicate numbers against existing local numbers and Tally master numbers', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345'],
        customPhones: ['+91 94150 11111'],
      });

      renderPartyDetail('p-sample');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // Open add form
      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));
      const input = screen.getByPlaceholderText('+91 98140 00000');
      const addBtn = screen.getAllByRole('button', { name: 'Add' }).slice(-1)[0]!;

      // Try adding duplicate of Tally master number
      fireEvent.change(input, { target: { value: '+91 98390 12345' } });
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('This contact number is already recorded for this party')).toBeInTheDocument();
      });

      // Try adding duplicate of existing Local contact number
      fireEvent.change(input, { target: { value: '+91 94150 11111' } });
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByText('This contact number is already recorded for this party')).toBeInTheDocument();
      });

      // Ensure local numbers count didn't grow
      const party = await mockApiClient.parties.get('p-sample');
      expect(party?.customPhones).toEqual(['+91 94150 11111']);
    });

    it('2.3: Supports adding multiple custom numbers and deleting arbitrary numbers (first, middle, last)', async () => {
      await mockApiClient.parties.update('p-sample', {
        customPhones: ['+91 90000 00001', '+91 90000 00002', '+91 90000 00003'],
      });

      renderPartyDetail('p-sample');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByText('+91 90000 00001')).toBeInTheDocument();
        expect(screen.getByText('+91 90000 00002')).toBeInTheDocument();
        expect(screen.getByText('+91 90000 00003')).toBeInTheDocument();
      });

      // Delete the middle number (+91 90000 00002)
      fireEvent.click(screen.getByLabelText('Delete +91 90000 00002'));

      await waitFor(() => {
        expect(screen.queryByText('+91 90000 00002')).not.toBeInTheDocument();
        expect(screen.getByText('+91 90000 00001')).toBeInTheDocument();
        expect(screen.getByText('+91 90000 00003')).toBeInTheDocument();
      });

      let party = await mockApiClient.parties.get('p-sample');
      expect(party?.customPhones).toEqual(['+91 90000 00001', '+91 90000 00003']);

      // Delete remaining numbers
      fireEvent.click(screen.getByLabelText('Delete +91 90000 00001'));
      await waitFor(() => {
        expect(screen.queryByText('+91 90000 00001')).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Delete +91 90000 00003'));
      await waitFor(() => {
        expect(screen.queryByText('+91 90000 00003')).not.toBeInTheDocument();
        expect(screen.getByText('No local contact numbers saved yet. Add one above.')).toBeInTheDocument();
      });

      party = await mockApiClient.parties.get('p-sample');
      expect(party?.customPhones).toEqual([]);
    });

    it('2.4: Formats diverse international phone numbers correctly for call (tel:) and WhatsApp links', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['9814012345'], // 10 digit plain Indian number
        customPhones: ['+1 (415) 555-0199', '+44 20 7946 0999'], // US and UK numbers
      });

      renderPartyDetail('p-sample');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByText('Tally Master Numbers')).toBeInTheDocument();
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // 10-digit Indian: tel:9814012345, WhatsApp prepends 91 -> wa.me/919814012345
      const callLinks = screen.getAllByLabelText('Call 9814012345');
      expect(callLinks.length).toBeGreaterThanOrEqual(1);
      expect(callLinks[0]).toHaveAttribute('href', 'tel:9814012345');

      const waLinks = screen.getAllByLabelText('WhatsApp 9814012345');
      expect(waLinks.length).toBeGreaterThanOrEqual(1);
      expect(waLinks[0]).toHaveAttribute('href', 'https://wa.me/919814012345');

      // US number: tel:+1(415)555-0199, WhatsApp: wa.me/14155550199
      expect(screen.getByLabelText('Call +1 (415) 555-0199')).toHaveAttribute('href', 'tel:+1(415)555-0199');
      expect(screen.getByLabelText('WhatsApp +1 (415) 555-0199')).toHaveAttribute('href', 'https://wa.me/14155550199');

      // UK number: tel:+442079460999, WhatsApp: wa.me/442079460999
      expect(screen.getByLabelText('Call +44 20 7946 0999')).toHaveAttribute('href', 'tel:+442079460999');
      expect(screen.getByLabelText('WhatsApp +44 20 7946 0999')).toHaveAttribute('href', 'https://wa.me/442079460999');
    });

    it('2.5: Selects local number in reminder dialog and cleans up selected phone if deleted', async () => {
      await mockApiClient.parties.update('p-sample', {
        phones: ['+91 98390 12345'],
        customPhones: ['+91 99999 88888'],
      });

      renderPartyDetail('p-sample');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Send reminder/i })).toBeInTheDocument();
      });

      // Open reminder sheet
      fireEvent.click(screen.getByRole('button', { name: /Send reminder/i }));

      await waitFor(() => {
        expect(screen.getByText('Send Payment Reminder')).toBeInTheDocument();
      });

      // Select local number
      const localPhoneBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('+91 99999 88888'));
      expect(localPhoneBtn).toBeDefined();
      fireEvent.click(localPhoneBtn!);

      // Close reminder sheet dialog
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      // Now open Details sheet to delete this selected number
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Delete +91 99999 88888')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText('Delete +91 99999 88888'));

      await waitFor(() => {
        expect(screen.queryByText('+91 99999 88888')).not.toBeInTheDocument();
      });

      // Close Details sheet
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      // Re-opening reminder sheet falls back gracefully to Tally master number
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Send reminder/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Send reminder/i }));
      await waitFor(() => {
        expect(screen.getAllByText('+91 98390 12345').length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('+91 99999 88888')).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 3. HOME RECEIVABLES CALCULATION & CREDITOR EXCLUSION
  // =========================================================================
  describe('Dimension 3: Home Receivables Display & Calculation Rigor', () => {
    it('3.1: Massive creditor balances and overdue supplier bills never corrupt home receivables', async () => {
      // Add two massive creditors with gigantic balances
      await mockApiClient.parties.create({
        id: 'p-cred-huge-1',
        name: 'Reliance Petrochemicals Supplier',
        city: 'Mumbai',
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 1500000000, // 15 Crore payable
      });

      await mockApiClient.parties.create({
        id: 'p-cred-huge-2',
        name: 'Indian Oil Yarn Polymer Supplier',
        city: 'Panipat',
        partyType: 'creditor',
        parentGroup: 'Sundry Creditors',
        closingBalance: 2500000000, // 25 Crore payable
      });

      renderHome();

      await waitFor(() => {
        // Receivables MUST remain exactly the customer debt figure (₹18,42,300)
        expect(screen.getByText('₹18,42,300')).toBeInTheDocument();
        expect(screen.getByText('Customers owe you')).toBeInTheDocument();
        expect(screen.getByText('₹6,10,200 is overdue')).toBeInTheDocument();
      });

      // Most overdue list MUST NOT contain either creditor
      expect(screen.queryByText('Reliance Petrochemicals Supplier')).not.toBeInTheDocument();
      expect(screen.queryByText('Indian Oil Yarn Polymer Supplier')).not.toBeInTheDocument();
    });

    it('3.2: Customer with advance closing balance (negative) does not corrupt or deduct from total customer receivables', async () => {
      // Customer who paid an advance of ₹2,00,000 (credit closing balance / negative customer receivable)
      await mockApiClient.parties.create({
        id: 'p-customer-advance',
        name: 'Advance Paying Customer LLC',
        city: 'Jaipur',
        partyType: 'debtor',
        parentGroup: 'Sundry Debtors',
        closingBalance: -20000000, // Negative balance (they owe nothing, they have an advance)
      });

      renderHome();

      await waitFor(() => {
        // Receivables must remain unchanged at ₹18,42,300 and not drop by 2 lakh
        expect(screen.getByText('₹18,42,300')).toBeInTheDocument();
      });

      expect(screen.queryByText('Advance Paying Customer LLC')).not.toBeInTheDocument();
    });

    it('3.3: Reconciles customer bills with unadjusted advances and credit notes via FIFO', async () => {
      // Create a customer with a positive invoice of ₹1,00,000 and a credit note of -₹30,000
      // Closing balance = ₹70,000 (7,000,000 paise)
      await mockApiClient.parties.create({
        id: 'p-reconciled-fifo-test',
        name: 'Kanpur Garment Mills',
        city: 'Kanpur',
        partyType: 'debtor',
        parentGroup: 'Sundry Debtors',
        closingBalance: 7000000, // 70k in paise
      });

      const summary = await mockApiClient.home.summary('c1');
      // Total receivables includes the reconciled 70k net closing balance in paise
      expect(summary.totalReceivables).toBe(184230000 + 7000000);
    });

    it('3.4: RBAC protection: Users without ledgers.view permission are blocked from viewing receivables', async () => {
      // Set active user role to staff without ledgers.view permission
      useAppStore.setState({
        currentUser: {
          id: 'u-warehouse-staff',
          tenantId: 'tenant-1',
          name: 'Ramesh Staff',
          phone: '+91 98000 11111',
          role: 'stock_keeper',
          companyIds: ['c1'],
          active: true,
        },
        currentRole: 'stock_keeper',
      });

      renderHome();

      await waitFor(() => {
        expect(screen.getByText('Warehouse Operations Active')).toBeInTheDocument();
        expect(screen.getByText('Machinery & Dispatch Hub')).toBeInTheDocument();
      });

      // Hero receivables card and overdue metrics MUST NOT be rendered
      expect(screen.queryByText('Customers owe you')).not.toBeInTheDocument();
      expect(screen.queryByText('is overdue')).not.toBeInTheDocument();
      expect(screen.queryByText('Most overdue')).not.toBeInTheDocument();
    });
  });
});
