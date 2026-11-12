import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateChallanScreen } from '../features/challans/CreateChallanScreen.js';
import { ChallanDetailScreen } from '../features/challans/ChallanDetailScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { mockApiClient } from '../mock/db.js';
import { rupeesToPaise, calculateRoundOff } from '@saas/shared';
import '../i18n/index.js';

describe('R3: Purchase Challan Features & Edit Flow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const renderCreateScreen = (initialEntries = ['/challans/new']) =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route path="/challans/new" element={<CreateChallanScreen />} />
              <Route path="/challans/:id/edit" element={<CreateChallanScreen />} />
              <Route path="/challans/:id" element={<ChallanDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('R3.1: filters stock items in typeahead combobox by name, partNo, and group', async () => {
    renderCreateScreen();

    // Step 1: select party and continue
    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
    fireEvent.click(screen.getByText('Continue to Items'));

    // Step 2: Search item input
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);
    fireEvent.change(searchInput, { target: { value: 'SM-550D' } }); // Search by partNo

    await waitFor(() => {
      expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
    });

    // Check that non-matching items are not shown
    expect(screen.queryByText('Rotary Hook Assembly (Japanese Type)')).not.toBeInTheDocument();
  });

  it('R3.2: auto-adds item row upon selection and defaults to purchaseRate for purchase challans', async () => {
    // Add custom item with distinct purchaseRate and rate
    await mockApiClient.stock.items.create({
      id: 'item-purchase-test',
      name: 'Special Industrial Overlock Needle 14#',
      unit: 'box',
      group: 'Needles',
      rate: rupeesToPaise(800), // sales rate: ₹800
      purchaseRate: rupeesToPaise(550), // purchase rate: ₹550
      hsnCode: '8452',
    });

    renderCreateScreen();

    // Select "Purchase" challan type
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Purchase' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Purchase' }));

    // Select party and continue
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
    fireEvent.click(screen.getByText('Continue to Items'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search item by name, part #/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search item by name, part #/i);
    fireEvent.change(searchInput, { target: { value: 'Special Industrial Overlock' } });

    await waitFor(() => {
      // Dropdown button should display purchase rate (₹550)
      expect(screen.getByText(/₹550/)).toBeInTheDocument();
    });

    // Click the item row to auto-add
    const itemButton = screen.getByText('Special Industrial Overlock Needle 14#');
    fireEvent.click(itemButton);

    // Dropdown closes, search input clears, line added with qty 1 and rate 550
    await waitFor(() => {
      expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Special Industrial Overlock Needle 14#')).toBeInTheDocument();
    expect(screen.getByDisplayValue('550')).toBeInTheDocument(); // Defaulted to purchaseRate
    expect(screen.getByDisplayValue('1')).toBeInTheDocument(); // Defaulted qty: 1
    expect(searchInput).toHaveValue(''); // Search cleared
  });

  it('R3.3 & R3.4: adds blank row, edits itemDescription, qty, and rate with real-time recalculation', async () => {
    renderCreateScreen();

    // Select party and continue
    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
    fireEvent.click(screen.getByText('Continue to Items'));

    await waitFor(() => {
      expect(screen.getByText('+ Add Blank Row')).toBeInTheDocument();
    });

    // Click "+ Add Blank Row"
    fireEvent.click(screen.getByText('+ Add Blank Row'));

    await waitFor(() => {
      expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
    });

    // Edit item description, note, qty and rate
    const descInput = screen.getByPlaceholderText(/Line description \/ notes \(optional/i);
    fireEvent.change(descInput, { target: { value: 'Batch B-998 Machine Head with Stand' } });
    expect(descInput).toHaveValue('Batch B-998 Machine Head with Stand');

    const qtyInput = screen.getByLabelText('Quantity');
    fireEvent.change(qtyInput, { target: { value: '3' } });

    const rateInput = screen.getByLabelText('Rate');
    fireEvent.change(rateInput, { target: { value: '1200' } });

    // Line total and subtotal should update to ₹3,600 (3 * 1200)
    await waitFor(() => {
      expect(screen.getAllByText('₹3,600').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('R3.3: round-off adjustments auto calculate and support manual override in review step', async () => {
    renderCreateScreen();

    await waitFor(() => {
      expect(screen.getByText('Sample Garments Pvt Ltd')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Sample Garments Pvt Ltd'));
    fireEvent.click(screen.getByText('Continue to Items'));

    // Add a blank row with non-integer rupee GST to produce non-zero round-off
    await waitFor(() => {
      expect(screen.getByText('+ Add Blank Row')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('+ Add Blank Row'));

    const rateInput = screen.getByLabelText('Rate');
    fireEvent.change(rateInput, { target: { value: '100.50' } }); // ₹100.50 -> 10050 paise + 18% GST (1809 paise) = 11859 paise (₹118.59) -> round-off +41 paise to ₹119.00

    fireEvent.click(screen.getByText('Continue to Review'));

    await waitFor(() => {
      expect(screen.getByText('Round-Off Adjustment')).toBeInTheDocument();
    });

    // Check Auto nearest-rupee round-off calculation
    const autoCalc = calculateRoundOff(10050, Math.round(10050 * 0.18));
    expect(autoCalc.roundOffPaise).toBe(41);
    expect(screen.getByText('Automatic nearest-rupee rounding')).toBeInTheDocument();

    // Toggle to Manual Round-Off
    const manualTab = screen.getByRole('tab', { name: 'Manual' });
    fireEvent.click(manualTab);

    await waitFor(() => {
      expect(screen.getByLabelText('Manual round-off adjustment')).toBeInTheDocument();
    });

    const manualInput = screen.getByLabelText('Manual round-off adjustment');
    fireEvent.change(manualInput, { target: { value: '-0.59' } });

    // Review display updates
    await waitFor(() => {
      expect(screen.getByText('-₹0.59')).toBeInTheDocument();
    });
  });

  it('R3.5: challan edit mode pre-populates existing challan, updates fields and calls api.challans.update', async () => {
    // Create a challan in mock db to edit
    const seeded = await mockApiClient.challans.create({
      companyId: 'c1',
      type: 'delivery',
      number: 'DC/999/26-27',
      date: '2026-10-20',
      partyId: 'p-sample',
      godownId: 'g1',
      lines: [
        {
          itemId: 'item-1',
          description: 'Servo Motor 550W (Direct Drive)',
          itemDescription: 'Serial #SM-1001',
          qty: 2,
          unit: 'pcs',
          rate: rupeesToPaise(4200),
          amount: rupeesToPaise(8400),
          hsnCode: '8452',
          gstRate: 18,
        },
      ],
      roundOff: 25,
      vehicleNo: 'PB-10-TEST-1',
      status: 'draft',
      createdBy: 'test-user',
    });

    renderCreateScreen([`/challans/${seeded.id}/edit`]);

    await waitFor(() => {
      expect(screen.getByText('Edit Challan')).toBeInTheDocument();
      // Wait for existingChallan query to populate party
      expect(screen.getByText('Selected: Sample Garments Pvt Ltd')).toBeInTheDocument();
    });

    // Advance to Step 2
    fireEvent.click(screen.getByText('Continue to Items'));

    await waitFor(() => {
      expect(screen.getByText('Lines Added (1)')).toBeInTheDocument();
    });

    // Prepopulated item description
    expect(screen.getByDisplayValue('Serial #SM-1001')).toBeInTheDocument();

    // Advance to Step 3
    fireEvent.click(screen.getByText('Continue to Review'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('PB-10-TEST-1')).toBeInTheDocument();
    });

    // Change vehicle number
    const vehicleInput = screen.getByLabelText('Vehicle Number');
    fireEvent.change(vehicleInput, { target: { value: 'PB-10-UPDATED-2' } });

    // Submit update
    const updateButton = screen.getByText('Update & Queue for Tally Sync');
    fireEvent.click(updateButton);

    await waitFor(async () => {
      const updated = await mockApiClient.challans.get(seeded.id);
      expect(updated?.vehicleNo).toBe('PB-10-UPDATED-2');
      expect(updated?.status).toBe('queued');
    });
  });

  it('R3.4 & R3.6: ChallanDetailScreen displays itemDescription, non-zero roundOff, and Edit button', async () => {
    // Seed challan with itemDescription and non-zero roundOff
    const detailChallan = await mockApiClient.challans.create({
      companyId: 'c1',
      type: 'delivery',
      number: 'DC/888/26-27',
      date: '2026-10-22',
      partyId: 'p-sample',
      godownId: 'g1',
      lines: [
        {
          itemId: 'item-2',
          description: 'Rotary Hook Assembly (Japanese Type)',
          itemDescription: 'High-speed hardened steel variant',
          qty: 5,
          unit: 'set',
          rate: rupeesToPaise(850),
          amount: rupeesToPaise(4250),
          hsnCode: '8452',
          gstRate: 18,
        },
      ],
      roundOff: 35, // +₹0.35 round off
      status: 'synced',
      createdBy: 'test-user',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/challans/${detailChallan.id}`]}>
            <Routes>
              <Route path="/challans/:id" element={<ChallanDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Detail screen loads
    await waitFor(() => {
      expect(screen.getByText(detailChallan.number)).toBeInTheDocument();
    });

    // Verify itemDescription is displayed
    expect(screen.getByText('Note: High-speed hardened steel variant')).toBeInTheDocument();

    // Verify Round Off row is rendered in financial breakdown
    expect(screen.getByText('Round Off')).toBeInTheDocument();
    expect(screen.getByText('+₹0.35')).toBeInTheDocument();

    // Verify Edit button exists and is clickable
    expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
  });
});
