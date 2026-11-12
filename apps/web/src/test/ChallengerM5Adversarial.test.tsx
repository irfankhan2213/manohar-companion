import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { CollectionsScreen } from '../features/collections/CollectionsScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient, resetMockDB } from '../mock/db.js';
import { rupeesToPaise } from '@saas/shared';
import '../i18n/index.js';

describe('Milestone 5 Web UI Adversarial Stress Suite', () => {
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
  });

  const renderScreen = (ui: React.ReactElement, initialEntries = ['/']) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>
            {ui}
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  describe('1. Adversarial Item Search & Auto-Add Stress Tests (R3)', () => {
    it('handles special regex characters, non-matching queries, and search clearing gracefully', async () => {
      renderScreen(
        <Routes>
          <Route path="/challans/new" element={<CreateChallanScreen />} />
        </Routes>,
        ['/challans/new']
      );

      // Advance past step 1
      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);

      // Adversarial Query: special regex characters that could crash RegExp constructors
      fireEvent.change(searchInput, { target: { value: '[*+?^${}()|\\/]' } });

      await waitFor(() => {
        expect(screen.getByText(/No stock items found matching/i)).toBeInTheDocument();
      });

      // Clear search via the clear button (X)
      const clearBtn = screen.getByLabelText('Clear item search');
      fireEvent.click(clearBtn);

      expect(searchInput).toHaveValue('');

      // Search by Part No 'SM-550D'
      fireEvent.change(searchInput, { target: { value: 'SM-550D' } });

      await waitFor(() => {
        expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
      });
    });

    it('accurately defaults purchaseRate to 0 when purchaseRate is 0, not falling back to sales rate', async () => {
      // Add custom item where purchaseRate is 0 (free promotional stock item)
      await mockApiClient.stock.items.create({
        id: 'item-free-promo',
        name: 'Promotional Lubricant Spray 500ml',
        unit: 'can',
        group: 'Consumables',
        rate: rupeesToPaise(250), // sales rate: ₹250
        purchaseRate: 0, // purchaseRate: 0 paise (free)
        hsnCode: '2710',
      });

      renderScreen(
        <Routes>
          <Route path="/challans/new" element={<CreateChallanScreen />} />
        </Routes>,
        ['/challans/new']
      );

      // Select purchase type
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Purchase' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: 'Purchase' }));
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);
      fireEvent.change(searchInput, { target: { value: 'Promotional Lubricant Spray' } });

      await waitFor(() => {
        expect(screen.getByText(/₹0 \/ can/)).toBeInTheDocument();
      });

      // Click to auto-add
      fireEvent.click(screen.getByText('Promotional Lubricant Spray 500ml'));

      await waitFor(() => {
        expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
      });

      // Rate input should display 0, not falling back to 250
      expect(screen.getByLabelText('Rate')).toHaveValue(0);
    });

    it('supports rapid multiple item additions and line removals with real-time recalculation', async () => {
      renderScreen(
        <Routes>
          <Route path="/challans/new" element={<CreateChallanScreen />} />
        </Routes>,
        ['/challans/new']
      );

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      await waitFor(() => {
        expect(screen.getByText('+ Add Blank Row')).toBeInTheDocument();
      });

      // Add blank row
      fireEvent.click(screen.getByText('+ Add Blank Row'));

      await waitFor(() => {
        expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
      });

      // Add second blank row
      fireEvent.click(screen.getByText('+ Add Blank Row'));

      await waitFor(() => {
        expect(screen.getByText('Lines Added (2)')).toBeInTheDocument();
      });

      // Edit line 0: qty 2, rate 500 -> 1000
      const qtyInputs = screen.getAllByLabelText('Quantity');
      const rateInputs = screen.getAllByLabelText('Rate');

      fireEvent.change(qtyInputs[0]!, { target: { value: '2' } });
      fireEvent.change(rateInputs[0]!, { target: { value: '500' } });

      // Edit line 1: qty 1, rate 300 -> 300
      fireEvent.change(qtyInputs[1]!, { target: { value: '1' } });
      fireEvent.change(rateInputs[1]!, { target: { value: '300' } });

      // Subtotal should be 1000 + 300 = ₹1,300
      await waitFor(() => {
        expect(screen.getByText('Subtotal (3 items)')).toBeInTheDocument();
        expect(screen.getAllByText('₹1,300').length).toBeGreaterThanOrEqual(1);
      });

      // Remove line 0
      const removeButtons = screen.getAllByLabelText('Remove line');
      fireEvent.click(removeButtons[0]!);

      // Should now have 1 line with Subtotal ₹300
      await waitFor(() => {
        expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
        expect(screen.getByText('Subtotal (1 items)')).toBeInTheDocument();
        expect(screen.getAllByText('₹300').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('2. Round-Off Mode Toggle & Manual Override Stress (R3)', () => {
    it('seamlessly toggles between Auto and Manual round-off and updates grand total', async () => {
      renderScreen(
        <Routes>
          <Route path="/challans/new" element={<CreateChallanScreen />} />
        </Routes>,
        ['/challans/new']
      );

      await waitFor(() => {
        expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
      fireEvent.click(screen.getByText('Continue to Items'));

      // Add blank row with ₹100.25 (10025 paise + 18% GST (1805 paise) = 11830 paise = ₹118.30)
      // Auto round-off should be -30 paise to ₹118.00
      await waitFor(() => {
        expect(screen.getByText('+ Add Blank Row')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Add Blank Row'));

      const rateInput = screen.getByLabelText('Rate');
      fireEvent.change(rateInput, { target: { value: '100.25' } });

      fireEvent.click(screen.getByText('Continue to Review'));

      await waitFor(() => {
        expect(screen.getByText('Round-Off Adjustment')).toBeInTheDocument();
      });

      // Default is Auto mode
      expect(screen.getByText('Automatic nearest-rupee rounding')).toBeInTheDocument();
      expect(screen.getByText('-₹0.30')).toBeInTheDocument();
      expect(screen.getByText('₹118')).toBeInTheDocument(); // Grand total rounded to whole ₹118

      // Switch to Manual mode
      const manualTab = screen.getByRole('tab', { name: 'Manual' });
      fireEvent.click(manualTab);

      await waitFor(() => {
        expect(screen.getByLabelText('Manual round-off adjustment')).toBeInTheDocument();
      });

      // Initial manual value prefilled from auto result (-0.30)
      const manualInput = screen.getByLabelText('Manual round-off adjustment');
      expect(manualInput).toHaveValue(-0.3);

      // Change manual round off to large override: +5.00
      fireEvent.change(manualInput, { target: { value: '5.00' } });

      await waitFor(() => {
        expect(screen.getByText('+₹5.00')).toBeInTheDocument();
        // Grand total becomes 118.30 + 5.00 = 123.30 -> displayed as ₹123
        expect(screen.getByText('₹123')).toBeInTheDocument();
      });

      // Switch back to Auto mode
      const autoTab = screen.getByRole('tab', { name: 'Auto' });
      fireEvent.click(autoTab);

      await waitFor(() => {
        expect(screen.getByText('Automatic nearest-rupee rounding')).toBeInTheDocument();
        expect(screen.getByText('-₹0.30')).toBeInTheDocument();
        expect(screen.getByText('₹118')).toBeInTheDocument();
      });
    });
  });

  describe('3. History Filtering Stress Tests (R4)', () => {
    it('handles inverted date ranges and single-day ranges in ChallansScreen', async () => {
      renderScreen(
        <Routes>
          <Route path="/challans" element={<ChallansScreen />} />
        </Routes>,
        ['/challans']
      );

      await waitFor(() => {
        expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
      });

      // Open filter sheet
      fireEvent.click(screen.getByLabelText('Filter Challans'));

      await waitFor(() => {
        expect(screen.getByLabelText('From Date')).toBeInTheDocument();
      });

      // Enter inverted date range: From 2026-11-01 To 2026-10-01
      fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-11-01' } });
      fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-10-01' } });
      fireEvent.click(screen.getByText('Apply Filters'));

      // Inverted date range returns 0 challans with clear empty state
      await waitFor(() => {
        expect(screen.getByText('No challans found')).toBeInTheDocument();
      });

      // Active chip shows inverted range
      expect(screen.getByText('2026-11-01 → 2026-10-01')).toBeInTheDocument();

      // Click "Clear All"
      fireEvent.click(screen.getByText('Clear All'));

      // Challans return
      await waitFor(() => {
        expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
      });
    });

    it('exercises quick date presets in ChallansScreen filter sheet', async () => {
      renderScreen(
        <Routes>
          <Route path="/challans" element={<ChallansScreen />} />
        </Routes>,
        ['/challans']
      );

      await waitFor(() => {
        expect(screen.getByText('DC/042/26-27')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Filter Challans'));

      await waitFor(() => {
        expect(screen.getByText('Quick Date Presets')).toBeInTheDocument();
      });

      // Click "Today"
      fireEvent.click(screen.getByText('Today'));

      const today = new Date().toISOString().split('T')[0] ?? '';
      expect(screen.getByLabelText('From Date')).toHaveValue(today);
      expect(screen.getByLabelText('To Date')).toHaveValue(today);

      // Click "All Time"
      fireEvent.click(screen.getByText('All Time'));
      expect(screen.getByLabelText('From Date')).toHaveValue('');
      expect(screen.getByLabelText('To Date')).toHaveValue('');
    });

    it('Bills History in CollectionsScreen supports non-matching search, reset and chip dismissal', async () => {
      renderScreen(
        <Routes>
          <Route path="/collections" element={<CollectionsScreen />} />
        </Routes>,
        ['/collections']
      );

      // Switch to Bills History
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Bills History' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Bills History' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search bill # or party name...')).toBeInTheDocument();
      });

      // Search non-existent query
      const searchInput = screen.getByPlaceholderText('Search bill # or party name...');
      fireEvent.change(searchInput, { target: { value: 'NONEXISTENT_BILL_99999' } });

      await waitFor(() => {
        expect(screen.getByText('No bills match the current filters.')).toBeInTheDocument();
      });

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getByText('GST/004/26-27')).toBeInTheDocument();
      });

      // Open Bills filter sheet
      fireEvent.click(screen.getByLabelText('Filter Bills'));

      await waitFor(() => {
        expect(screen.getByLabelText('Filter Bills by Party')).toBeInTheDocument();
      });

      // Set date range on bills
      fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-08-01' } });
      fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-08-01' } });
      fireEvent.click(screen.getByText('Apply Filters'));

      await waitFor(() => {
        expect(screen.getByText('2026-08-01 → 2026-08-01')).toBeInTheDocument();
      });

      // Dismiss date filter chip
      fireEvent.click(screen.getByLabelText('Clear bill date filter'));

      await waitFor(() => {
        expect(screen.queryByText('2026-08-01 → 2026-08-01')).not.toBeInTheDocument();
      });
    });
  });
});
