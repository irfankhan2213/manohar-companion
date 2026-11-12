import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { useAppStore } from '../app/store.js';
import '../i18n/index.js';

describe('Milestone 6 Challenger 2 Frontend Adversarial Verification (R1-R5)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    cleanup();
    resetMockDB();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
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

  const renderWithProviders = (ui: React.ReactElement, initialEntries = ['/']) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>
            {ui}
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  describe('R3: Stock Item Typeahead Regex Special Characters & Auto-Add Invariants', () => {
    it('handles adversarial search strings with regex special characters without crashing', async () => {
      renderWithProviders(
        <Routes>
          <Route path="/challans/new" element={<CreateChallanScreen />} />
        </Routes>,
        ['/challans/new']
      );

      // Step 1: select party and continue to items
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      // Step 2: Search item input is present
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);

      // Adversarial regex special character inputs:
      const maliciousInputs = [
        '***[[[(???',
        '\\^$.*+?()[{\|',
        'TAI (MACHINE)',
        ' needle [titanium] ',
        "'; DROP TABLE stock; --",
      ];

      for (const input of maliciousInputs) {
        fireEvent.change(searchInput, { target: { value: input } });
        // The component must not crash or throw unhandled exceptions
        expect(searchInput).toHaveValue(input);
      }

      // Now search for an existing stock item: "SM-550D"
      fireEvent.change(searchInput, { target: { value: 'SM-550D' } });
      await waitFor(() => {
        expect(screen.getByText(/Servo Motor 550W/i)).toBeInTheDocument();
      });

      // Click to auto-add item
      const itemOption = screen.getByText(/Servo Motor 550W/i);
      fireEvent.click(itemOption);

      // Verify line item was auto-added with description input available
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Line description \/ notes/i)).toBeInTheDocument();
      });
    });
  });

  describe('R1: Collections Debtor vs Creditor Differentiation & Reminder Prohibition', () => {
    it('accurately differentiates Debtors and Creditors with respective badges and prevents payment reminder multi-select for Creditors', async () => {
      await mockApiClient.parties.create({
        id: 'p-creditor-adv-1',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Vardhman Thread Mills',
        city: 'Ludhiana',
        phones: ['+91 98140 99999'],
        parentGroup: 'Sundry Creditors',
        partyType: 'creditor',
        notes: 'Supplier of sewing machine thread',
      });

      renderWithProviders(
        <Routes>
          <Route path="/collections" element={<CollectionsScreen />} />
        </Routes>,
        ['/collections']
      );

      // Wait for collections screen to load
      await waitFor(() => {
        expect(screen.getByText('Customers')).toBeInTheDocument();
        expect(screen.getByText('Suppliers')).toBeInTheDocument();
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Switch to Suppliers (Creditors) tab
      const suppliersTab = screen.getByText('Suppliers');
      fireEvent.click(suppliersTab);

      // Verify suppliers view state: in suppliers tab, creditor party is displayed with Supplier badge and Select button is suppressed
      await waitFor(() => {
        expect(screen.getByText('Vardhman Thread Mills')).toBeInTheDocument();
        expect(screen.getByText('Supplier')).toBeInTheDocument();
        expect(screen.getByText('You owe')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Send Reminders/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Select')).not.toBeInTheDocument();
      });
    });
  });

  describe('R1: Party Detail Local Contact Numbers Add & Duplicate Prevention', () => {
    it('manages local custom numbers and prevents adding duplicate numbers', async () => {
      renderWithProviders(
        <Routes>
          <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
        </Routes>,
        ['/collections/p-sample']
      );

      // Wait for party detail to render
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Open Details sheet
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      // Wait for Details sheet content to render
      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // Click "Add Number"
      const addNumberBtn = screen.getByRole('button', { name: /Add Number/i });
      fireEvent.click(addNumberBtn);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('+91 98140 00000')).toBeInTheDocument();
      });

      const phoneInput = screen.getByPlaceholderText('+91 98140 00000');

      // Enter a new custom number
      fireEvent.change(phoneInput, { target: { value: '+91 98140 77777' } });

      // Click "Add" button inside the add form
      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      // Verify success message / added number
      await waitFor(() => {
        expect(screen.getByText('+91 98140 77777')).toBeInTheDocument();
      });

      // Try adding the exact same number again
      fireEvent.click(screen.getByRole('button', { name: /Add Number/i }));
      const phoneInput2 = screen.getByPlaceholderText('+91 98140 00000');
      fireEvent.change(phoneInput2, { target: { value: '+91 98140 77777' } });
      const addButtons2 = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons2[addButtons2.length - 1]!);

      // Should show already recorded toast/error
      await waitFor(() => {
        expect(screen.getByText(/already recorded for this party/i)).toBeInTheDocument();
      });
    });
  });
});
