import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { PartyDetailScreen } from '../features/collections/PartyDetailScreen.js';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { LargeTitleScreen } from '../components/ui/LargeTitleScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { useAppStore } from '../app/store.js';
import { rupeesToPaise } from '@saas/shared';
import '../i18n/index.js';

describe('Milestone 6 Challenger 1 End-to-End Stress Suite (R1-R5)', () => {
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

  describe('R1: Collections & Overdue Party Differentiation UI and Reminder Protection', () => {
    it('renders Debtors (Customers) vs Creditors (Suppliers) tabs and strictly suppresses payment reminders for creditors', async () => {
      await mockApiClient.parties.create({
        id: 'p-creditor-stress-1',
        tenantId: 'tenant-1',
        companyId: 'c1',
        name: 'Vardhman Thread Mills',
        city: 'Ludhiana',
        phones: ['+91 98140 99999'],
        parentGroup: 'Sundry Creditors',
        partyType: 'creditor',
        notes: 'Supplier of sewing machine thread',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/collections']}>
              <Routes>
                <Route path="/collections" element={<CollectionsScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      );

      // Wait for parties to load
      await waitFor(() => {
        expect(screen.getByText(/Collections/i)).toBeInTheDocument();
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Verify Segmented Control tabs exist with role="tab"
      const customersTab = screen.getByRole('tab', { name: /Customers/i });
      const suppliersTab = screen.getByRole('tab', { name: /Suppliers/i });
      const allTab = screen.getByRole('tab', { name: /^All$/i });

      expect(customersTab).toBeInTheDocument();
      expect(suppliersTab).toBeInTheDocument();
      expect(allTab).toBeInTheDocument();

      // In Customers tab, 'Select' multi-select button is available
      expect(screen.getByText('Select')).toBeInTheDocument();

      // Switch to Suppliers (Creditors) tab
      fireEvent.click(suppliersTab);

      // In Suppliers view, payment reminder buttons or "Send Reminder" actions MUST NOT be present
      await waitFor(() => {
        expect(screen.getByText('Vardhman Thread Mills')).toBeInTheDocument();
        expect(screen.getByText('Supplier')).toBeInTheDocument();
        expect(screen.getByText('You owe')).toBeInTheDocument();
        expect(screen.queryByText(/Send Reminder/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Send WhatsApp/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Select')).not.toBeInTheDocument();
      });
    });

    it('manages local custom contact numbers on PartyDetailScreen with local-only badge', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/collections/p-sample']}>
              <Routes>
                <Route path="/collections/:partyId" element={<PartyDetailScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      );

      // Wait for party detail hero to load
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });

      // Open Customer Details Sheet via header button
      fireEvent.click(screen.getByRole('button', { name: 'Details' }));

      // Verify Local Contact Numbers section exists in Details sheet
      await waitFor(() => {
        expect(screen.getByText('Local Contact Numbers')).toBeInTheDocument();
      });

      // Click "Add Number"
      const addBtn = screen.getByRole('button', { name: /Add Number/i });
      fireEvent.click(addBtn);

      // Enter a new custom phone number
      const input = screen.getByPlaceholderText('+91 98140 00000');
      fireEvent.change(input, { target: { value: '+91 98765 43210' } });

      // Save number via "Add" button inside the add form
      const addButtons = screen.getAllByRole('button', { name: 'Add' });
      fireEvent.click(addButtons[addButtons.length - 1]!);

      // Verify number is added with "Local" badge and Call/WhatsApp action links
      await waitFor(() => {
        expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
        expect(screen.getByText('Local')).toBeInTheDocument();
      });
    });
  });

  describe('R3: Purchase Challan Creation, Item Search, Auto-Add Row & Round-Off UI', () => {
    it('creates purchase challan with searchable item picker, auto-added line item, and round-off controls', async () => {
      // Create a test item with distinct purchase rate
      await mockApiClient.stock.items.create({
        id: 'item-m6-needle',
        name: 'Titanium Needles Set #18',
        unit: 'box',
        group: 'Needles',
        rate: rupeesToPaise(600),
        purchaseRate: rupeesToPaise(420),
        hsnCode: '8452',
      });

      render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/challans/new']}>
              <Routes>
                <Route path="/challans/new" element={<CreateChallanScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      );

      // Switch to Purchase type
      await waitFor(() => {
        expect(screen.getByText('Purchase')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Purchase'));

      // Select party and continue
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      // In Step 2: Search item input
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);
      fireEvent.change(searchInput, { target: { value: 'Titanium Needles' } });

      await waitFor(() => {
        expect(screen.getByText('Titanium Needles Set #18')).toBeInTheDocument();
      });

      // Click to select item
      fireEvent.click(screen.getByText('Titanium Needles Set #18'));

      // Auto-added row verification
      await waitFor(() => {
        expect(screen.getByDisplayValue('Titanium Needles Set #18')).toBeInTheDocument();
      });

      // Verify line description notes input is present via aria-label
      expect(screen.getByLabelText('Line item description')).toBeInTheDocument();

      // Advance to Step 3: Review to view financial summary and round-off controls
      const continueBtn = screen.getByRole('button', { name: /Continue to Review/i });
      expect(continueBtn).not.toBeDisabled();
      fireEvent.click(continueBtn);

      // Verify Round-off adjustment section exists in Step 3
      await waitFor(() => {
        expect(screen.getByText(/Round-Off Adjustment/i)).toBeInTheDocument();
      });
    });
  });

  describe('R4: Past Challans and Past Bills History Filtering UI', () => {
    it('opens filter sheet on ChallansScreen, applies date presets, and verifies active chips', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/challans']}>
              <Routes>
                <Route path="/challans" element={<ChallansScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/^Challans$/i)).toBeInTheDocument();
      });

      // Open filter sheet
      const filterBtn = screen.getByRole('button', { name: /Filter Challans/i });
      fireEvent.click(filterBtn);

      // Verify filter sheet elements
      await waitFor(() => {
        expect(screen.getByText(/Filter Challans/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /This Month/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Last 30 Days/i })).toBeInTheDocument();
      });

      // Click "This Month"
      fireEvent.click(screen.getByRole('button', { name: /This Month/i }));

      // Click "Apply Filters"
      const applyBtn = screen.getByRole('button', { name: /Apply Filters/i });
      fireEvent.click(applyBtn);

      // Verify active filter chip bar renders with "Clear All"
      await waitFor(() => {
        expect(screen.getByText(/Clear All/i)).toBeInTheDocument();
      });

      // Click "Clear All"
      fireEvent.click(screen.getByText(/Clear All/i));

      await waitFor(() => {
        expect(screen.queryByText(/Clear All/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('R5: Mobile Header Viewport Layout Stress & Clearance', () => {
    it('renders clean mobile header without company selector and notification bell overlap at narrow viewport', () => {
      // Simulate extreme long company name
      vi.spyOn(mockApiClient.companies, 'list').mockResolvedValueOnce([
        {
          id: 'c1',
          tenantId: 'tenant-1',
          name: 'Manohar Traders & Precision Loom Machinery Manufacturing Industrial Private Limited Ludhiana Punjab 141003',
          agentStatus: 'online',
        } as any,
      ]);
      useAppStore.setState({
        currentCompanyId: 'c1',
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LargeTitleScreen title="Dashboard">
              <div>Dashboard Content</div>
            </LargeTitleScreen>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const headerDiv = container.querySelector('header > div');
      expect(headerDiv).toBeInTheDocument();

      // Verify left container enforces flex-1 min-w-0
      const leftCol = headerDiv?.children[0];
      expect(leftCol?.className).toContain('min-w-0');
      expect(leftCol?.className).toContain('flex-1');

      // Verify right container enforces shrink-0
      const rightCol = headerDiv?.children[1];
      expect(rightCol?.className).toContain('shrink-0');

      // Verify company name truncation guardrail
      const companySpan = headerDiv?.querySelector('span.truncate');
      expect(companySpan).toBeInTheDocument();
      expect(companySpan?.className).toContain('truncate');
      expect(companySpan?.className).toContain('min-w-0');
    });
  });
});
