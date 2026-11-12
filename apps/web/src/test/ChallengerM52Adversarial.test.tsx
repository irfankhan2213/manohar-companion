import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallanDetailScreen } from '../features/challans/ChallanDetailScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { useAppStore } from '../app/store.js';
import { rupeesToPaise } from '@saas/shared';
import '../i18n/index.js';

describe('Milestone 5 Adversarial Verification & Stress Test Suite (Challenger M5-2)', () => {
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

  const renderApp = (initialEntries = ['/challans']) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/challans" element={<ChallansScreen />} />
              <Route path="/challans/new" element={<CreateChallanScreen />} />
              <Route path="/challans/:id/edit" element={<CreateChallanScreen />} />
              <Route path="/challans/:id" element={<ChallanDetailScreen />} />
              <Route path="/collections" element={<CollectionsScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  describe('1. Challan Edit Lifecycle (/challans/:id/edit prefill, updates, and persistence)', () => {
    it('adversarially executes full edit round-trip: creates challan with custom itemDescription and roundOff, edits lines, adjusts roundOff, and verifies database and detail view persistence', async () => {
      // 1. Seed initial challan with 2 lines, specific itemDescription and non-zero roundOff (+40 paise)
      const seeded = await mockApiClient.challans.create({
        companyId: 'c1',
        type: 'delivery',
        number: 'DC/ADV-101/26-27',
        date: '2026-10-18',
        partyId: 'p-sample',
        godownId: 'g1',
        lines: [
          {
            itemId: 'item-1',
            description: 'Servo Motor 550W (Direct Drive)',
            itemDescription: 'Initial Serial #SM-ALPHA',
            qty: 2,
            unit: 'pcs',
            rate: rupeesToPaise(4200),
            amount: rupeesToPaise(8400),
            hsnCode: '8452',
            gstRate: 18,
          },
          {
            itemId: 'item-2',
            description: 'Rotary Hook Assembly (Japanese Type)',
            itemDescription: 'Batch B1 Standard',
            qty: 1,
            unit: 'set',
            rate: rupeesToPaise(850),
            amount: rupeesToPaise(850),
            hsnCode: '8452',
            gstRate: 18,
          },
        ],
        roundOff: 40,
        vehicleNo: 'PB-10-INITIAL',
        lrNo: 'LR-1001',
        transporter: 'Punjab Roadlines',
        narration: 'Urgent dispatch for stitching unit',
        status: 'draft',
        createdBy: 'u1',
      });

      // 2. Open edit route: /challans/:id/edit
      renderApp([`/challans/${seeded.id}/edit`]);

      // Step 1: Verify header title, party selection and type are prefilled
      await waitFor(() => {
        expect(screen.getByText('Edit Challan')).toBeInTheDocument();
        expect(screen.getByText('Selected: Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Advance to Step 2: Items
      fireEvent.click(screen.getByText('Continue to Items'));

      await waitFor(() => {
        expect(screen.getByText('Lines Added (2)')).toBeInTheDocument();
      });

      // Verify prefilled item descriptions and line notes
      expect(screen.getByDisplayValue('Initial Serial #SM-ALPHA')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Batch B1 Standard')).toBeInTheDocument();

      // Adversarially modify Line 1: Change line notes and change quantity to 5
      const lineNoteInputs = screen.getAllByPlaceholderText(/Line description \/ notes \(optional/i);
      expect(lineNoteInputs.length).toBe(2);
      fireEvent.change(lineNoteInputs[0]!, { target: { value: 'Updated Serial #SM-OMEGA-999 (High Torque)' } });

      const qtyInputs = screen.getAllByLabelText('Quantity');
      expect(qtyInputs.length).toBe(2);
      fireEvent.change(qtyInputs[0]!, { target: { value: '5' } }); // 5 * 4200 = 21000

      // Adversarially remove Line 2
      const removeButtons = screen.getAllByLabelText('Remove line');
      expect(removeButtons.length).toBe(2);
      fireEvent.click(removeButtons[1]!); // Remove line 2

      await waitFor(() => {
        expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
      });
      expect(screen.queryByDisplayValue('Batch B1 Standard')).not.toBeInTheDocument();

      // Add a third custom line using "+ Add Blank Row"
      fireEvent.click(screen.getByText('+ Add Blank Row'));

      await waitFor(() => {
        expect(screen.getByText('Lines Added (2)')).toBeInTheDocument();
      });

      const updatedLineNoteInputs = screen.getAllByPlaceholderText(/Line description \/ notes \(optional/i);
      fireEvent.change(updatedLineNoteInputs[1]!, { target: { value: 'Custom brass fitting adapter kit' } });

      const itemDescInputs = screen.getAllByPlaceholderText('Item Description');
      fireEvent.change(itemDescInputs[1]!, { target: { value: 'Special Thread Stand Heavy Duty' } });

      const updatedQtyInputs = screen.getAllByLabelText('Quantity');
      fireEvent.change(updatedQtyInputs[1]!, { target: { value: '2' } });

      const updatedRateInputs = screen.getAllByLabelText('Rate');
      fireEvent.change(updatedRateInputs[1]!, { target: { value: '350' } }); // 2 * 350 = 700

      // Subtotal should recalculate: 21000 + 700 = ₹21,700
      await waitFor(() => {
        expect(screen.getByText('₹21,700')).toBeInTheDocument();
      });

      // Advance to Step 3: Transport & Review
      fireEvent.click(screen.getByText('Continue to Review'));

      await waitFor(() => {
        expect(screen.getByDisplayValue('PB-10-INITIAL')).toBeInTheDocument();
        expect(screen.getByText('Round-Off Adjustment')).toBeInTheDocument();
      });

      // Update vehicle number and narration
      const vehicleInput = screen.getByLabelText('Vehicle Number');
      fireEvent.change(vehicleInput, { target: { value: 'PB-10-FINAL-99' } });

      const narrationInput = screen.getByLabelText('Remarks or Narration');
      fireEvent.change(narrationInput, { target: { value: 'Updated: Dispatched via express tempo' } });

      // Switch roundOff to Manual and apply negative roundOff: -0.65 (-65 paise)
      const manualTab = screen.getByRole('tab', { name: 'Manual' });
      fireEvent.click(manualTab);

      await waitFor(() => {
        expect(screen.getByLabelText('Manual round-off adjustment')).toBeInTheDocument();
      });

      const manualRoundOffInput = screen.getByLabelText('Manual round-off adjustment');
      fireEvent.change(manualRoundOffInput, { target: { value: '-0.65' } });

      await waitFor(() => {
        expect(screen.getByText('-₹0.65')).toBeInTheDocument();
      });

      // Submit update via "Update & Queue for Tally Sync"
      const updateButton = screen.getByText('Update & Queue for Tally Sync');
      fireEvent.click(updateButton);

      // Verify persistence in mock database
      await waitFor(async () => {
        const persisted = await mockApiClient.challans.get(seeded.id);
        expect(persisted).not.toBeNull();
        expect(persisted?.status).toBe('queued');
        expect(persisted?.vehicleNo).toBe('PB-10-FINAL-99');
        expect(persisted?.narration).toBe('Updated: Dispatched via express tempo');
        expect(persisted?.roundOff).toBe(-65);
        expect(persisted?.lines.length).toBe(2);
        expect(persisted?.lines[0]?.itemDescription).toBe('Updated Serial #SM-OMEGA-999 (High Torque)');
        expect(persisted?.lines[0]?.qty).toBe(5);
        expect(persisted?.lines[1]?.description).toBe('Special Thread Stand Heavy Duty');
        expect(persisted?.lines[1]?.itemDescription).toBe('Custom brass fitting adapter kit');
        expect(persisted?.lines[1]?.rate).toBe(rupeesToPaise(350));
      });
    });

    it('pre-populates negative round-off into manual round-off mode on edit screen', async () => {
      const seededNegative = await mockApiClient.challans.create({
        companyId: 'c1',
        type: 'purchase',
        number: 'PC/ADV-NEG/26-27',
        date: '2026-10-25',
        partyId: 'p-sample',
        godownId: 'g1',
        lines: [
          {
            itemId: 'item-1',
            description: 'Servo Motor 550W (Direct Drive)',
            qty: 1,
            unit: 'pcs',
            rate: rupeesToPaise(4000),
            amount: rupeesToPaise(4000),
          },
        ],
        roundOff: -45, // -₹0.45
        status: 'draft',
        createdBy: 'u1',
      });

      renderApp([`/challans/${seededNegative.id}/edit`]);

      await waitFor(() => {
        expect(screen.getByText('Edit Challan')).toBeInTheDocument();
        expect(screen.getByText('Selected: Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Navigate to Step 3 Review
      fireEvent.click(screen.getByText('Continue to Items'));
      await waitFor(() => expect(screen.getByText('Lines Added (1)')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Continue to Review'));

      await waitFor(() => {
        expect(screen.getByText('Round-Off Adjustment')).toBeInTheDocument();
      });

      // Should have switched to Manual mode automatically and populated -0.45
      const manualInput = screen.getByLabelText('Manual round-off adjustment') as HTMLInputElement;
      expect(manualInput).toBeInTheDocument();
      expect(Number(manualInput.value)).toBe(-0.45);
      expect(screen.getByText('-₹0.45')).toBeInTheDocument();
    });

    it('navigates from ChallanDetailScreen Edit button to /challans/:id/edit', async () => {
      const seeded = await mockApiClient.challans.create({
        companyId: 'c1',
        type: 'sales',
        number: 'SC/NAV-TEST/26-27',
        date: '2026-10-26',
        partyId: 'p-sample',
        godownId: 'g1',
        lines: [
          {
            itemId: 'item-1',
            description: 'Servo Motor 550W (Direct Drive)',
            qty: 1,
            unit: 'pcs',
            rate: rupeesToPaise(4500),
            amount: rupeesToPaise(4500),
          },
        ],
        roundOff: 0,
        status: 'draft',
        createdBy: 'u1',
      });

      renderApp([`/challans/${seeded.id}`]);

      await waitFor(() => {
        expect(screen.getByText(seeded.number)).toBeInTheDocument();
      });

      const editBtn = screen.getByRole('button', { name: /Edit/i });
      fireEvent.click(editBtn);

      await waitFor(() => {
        expect(screen.getByText('Edit Challan')).toBeInTheDocument();
      });
    });
  });

  describe('2. Bills History View Mode Transitions & State Isolation in CollectionsScreen.tsx', () => {
    it('isolates search and filter states between Receivables and Bills History views with zero state bleed', async () => {
      renderApp(['/collections']);

      // 1. Initial State: Receivables view
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Receivables' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Bills History' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByPlaceholderText('Search customer or city')).toBeInTheDocument();
      });

      // Type into Receivables search bar
      const receivablesSearch = screen.getByPlaceholderText('Search customer or city');
      fireEvent.change(receivablesSearch, { target: { value: 'Bharat' } });
      expect(receivablesSearch).toHaveValue('Bharat');

      // Click "Overdue Only" in Receivables
      const overdueBtn = screen.getByRole('button', { name: 'Overdue Only' });
      fireEvent.click(overdueBtn);

      // Verify header filter button has aria-label="Filter"
      expect(screen.getByLabelText('Filter')).toBeInTheDocument();

      // 2. Switch to "Bills History" view
      const billsHistoryTab = screen.getByRole('button', { name: 'Bills History' });
      fireEvent.click(billsHistoryTab);

      // Verify view mode toggles
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Bills History' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Receivables' })).toHaveAttribute('aria-pressed', 'false');
      });

      // Verify Bills Search Bar is rendered and its initial value is EMPTY (not polluted by "Bharat")
      const billsSearch = screen.getByPlaceholderText('Search bill # or party name...');
      expect(billsSearch).toBeInTheDocument();
      expect(billsSearch).toHaveValue('');

      // Verify header filter button now has aria-label="Filter Bills"
      expect(screen.getByLabelText('Filter Bills')).toBeInTheDocument();

      // Apply bills search filter: "GST/004"
      fireEvent.change(billsSearch, { target: { value: 'GST/004' } });

      await waitFor(() => {
        expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
        expect(screen.queryByText('GST/014/26-27')).not.toBeInTheDocument();
      });

      // 3. Switch back to "Receivables" view
      const receivablesTab = screen.getByRole('button', { name: 'Receivables' });
      fireEvent.click(receivablesTab);

      // Verify view mode switches back
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Receivables' })).toHaveAttribute('aria-pressed', 'true');
      });

      // Verify Receivables search value was preserved and not corrupted
      const restoredReceivablesSearch = screen.getByPlaceholderText('Search customer or city');
      expect(restoredReceivablesSearch).toHaveValue('Bharat');
      expect(screen.getByLabelText('Filter')).toBeInTheDocument();

      // 4. Switch back to "Bills History" view and verify bills search value was preserved
      fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Bills History' })).toHaveAttribute('aria-pressed', 'true');
      });
      const restoredBillsSearch = screen.getByPlaceholderText('Search bill # or party name...');
      expect(restoredBillsSearch).toHaveValue('GST/004');
    });

    it('tests combined filtering in Bills History: text search + party dropdown + date range presets and manual inputs', async () => {
      renderApp(['/collections']);

      // Switch to Bills History
      fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));

      await waitFor(() => {
        expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
        expect(screen.getByText('GST/014/26-27')).toBeInTheDocument();
      });

      // Open Bills Filter Sheet
      const filterBillsBtn = screen.getByLabelText('Filter Bills');
      fireEvent.click(filterBillsBtn);

      await waitFor(() => {
        expect(screen.getByText('Filter Bills History')).toBeInTheDocument();
        expect(screen.getByLabelText('Filter Bills by Party')).toBeInTheDocument();
      });

      // Select party: Bharat Textiles (p-bharat)
      fireEvent.change(screen.getByLabelText('Filter Bills by Party'), { target: { value: 'p-bharat' } });

      // Click "All Time" preset
      fireEvent.click(screen.getByText('All Time'));
      expect(screen.getByLabelText('From Date')).toHaveValue('');
      expect(screen.getByLabelText('To Date')).toHaveValue('');

      // Set manual date range to match 2026-08-10 (bill GST/014 date)
      fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-08-31' } });

      // Apply
      fireEvent.click(screen.getByText('Apply Filters'));

      // Verify filtered bills: only GST/014
      await waitFor(() => {
        expect(screen.getByText('GST/014/26-27')).toBeInTheDocument();
        expect(screen.queryByText('GST/004/26-27')).not.toBeInTheDocument();
      });

      // Verify active chips bar is rendered
      expect(screen.getByText(/Party: Bharat Textiles/i)).toBeInTheDocument();
      expect(screen.getByText('2026-08-01 → 2026-08-31')).toBeInTheDocument();

      // Dismiss date filter chip
      const clearDateBtn = screen.getByLabelText('Clear bill date filter');
      fireEvent.click(clearDateBtn);

      // Date chip removed, party chip remains
      await waitFor(() => {
        expect(screen.queryByText('2026-08-01 → 2026-08-31')).not.toBeInTheDocument();
        expect(screen.getByText(/Party: Bharat Textiles/i)).toBeInTheDocument();
      });

      // Click "Clear All"
      fireEvent.click(screen.getByText('Clear All'));

      // Both bills restored
      await waitFor(() => {
        expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
        expect(screen.getByText('GST/014/26-27')).toBeInTheDocument();
      });
    });

    it('opens distinct filter sheets in Receivables vs Bills History views via header filter button', async () => {
      renderApp(['/collections']);

      // 1. In Receivables view: click filter button
      await waitFor(() => expect(screen.getByLabelText('Filter')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('Filter'));

      await waitFor(() => {
        expect(screen.getByText('Filter Receivables')).toBeInTheDocument();
        expect(screen.getByText('1 to 30 Days Overdue')).toBeInTheDocument();
      });

      // Select an aging option (closes sheet)
      fireEvent.click(screen.getByText('1 to 30 Days Overdue'));

      // 2. Switch to Bills History view
      fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));

      await waitFor(() => expect(screen.getByLabelText('Filter Bills')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('Filter Bills'));

      await waitFor(() => {
        expect(screen.getByText('Filter Bills History')).toBeInTheDocument();
        expect(screen.getByLabelText('Filter Bills by Party')).toBeInTheDocument();
        expect(screen.queryByText('1 to 30 Days Overdue')).not.toBeInTheDocument();
      });

      // Close sheet
      fireEvent.click(screen.getByText('Apply Filters'));
    });
  });

  describe('3. Accessibility and Responsive Interactions', () => {
    it('verifies ARIA roles, labels, and pressed states across the view switcher and inputs', async () => {
      renderApp(['/collections']);

      await waitFor(() => {
        // Group role on switcher
        const group = screen.getByRole('group', { name: 'Collections view' });
        expect(group).toBeInTheDocument();
      });

      const receivablesBtn = screen.getByRole('button', { name: 'Receivables' });
      const billsHistoryBtn = screen.getByRole('button', { name: 'Bills History' });

      // Default: Receivables pressed, Bills History not pressed
      expect(receivablesBtn).toHaveAttribute('aria-pressed', 'true');
      expect(billsHistoryBtn).toHaveAttribute('aria-pressed', 'false');

      // Click Bills History
      fireEvent.click(billsHistoryBtn);
      expect(receivablesBtn).toHaveAttribute('aria-pressed', 'false');
      expect(billsHistoryBtn).toHaveAttribute('aria-pressed', 'true');
    });

    it('validates typeahead combobox interaction, dropdown open/close, and suggestion button accessibility', async () => {
      renderApp(['/challans/new']);

      // Continue to step 2
      await waitFor(() => expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      await waitFor(() => {
        expect(screen.getByLabelText('Search stock item')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText('Search stock item');

      // Focus opens dropdown
      fireEvent.focus(searchInput);
      await waitFor(() => {
        expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
      });

      // Type search query
      fireEvent.change(searchInput, { target: { value: 'Rotary' } });

      await waitFor(() => {
        expect(screen.getByText('Rotary Hook Assembly (Japanese Type)')).toBeInTheDocument();
        expect(screen.queryByText('Servo Motor 550W (Direct Drive)')).not.toBeInTheDocument();
      });

      // Clear search button appears with accessible label
      const clearBtn = screen.getByLabelText('Clear item search');
      expect(clearBtn).toBeInTheDocument();

      // Clear search closes dropdown and resets query
      fireEvent.click(clearBtn);
      expect(searchInput).toHaveValue('');
      expect(screen.queryByLabelText('Clear item search')).not.toBeInTheDocument();
    });

    it('verifies responsive clear buttons on search fields and filter sheets', async () => {
      renderApp(['/collections']);

      // Type in Receivables search
      const recSearch = screen.getByPlaceholderText('Search customer or city');
      fireEvent.change(recSearch, { target: { value: 'Ludhiana' } });

      const clearRecSearchBtn = screen.getByLabelText('Clear search');
      expect(clearRecSearchBtn).toBeInTheDocument();
      fireEvent.click(clearRecSearchBtn);
      expect(recSearch).toHaveValue('');

      // Switch to Bills History and test clear bill search
      fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));
      await waitFor(() => expect(screen.getByPlaceholderText('Search bill # or party name...')).toBeInTheDocument());

      const billSearch = screen.getByPlaceholderText('Search bill # or party name...');
      fireEvent.change(billSearch, { target: { value: 'GST' } });

      const clearBillSearchBtn = screen.getByLabelText('Clear bill search');
      expect(clearBillSearchBtn).toBeInTheDocument();
      fireEvent.click(clearBillSearchBtn);
      expect(billSearch).toHaveValue('');
    });
  });
});
