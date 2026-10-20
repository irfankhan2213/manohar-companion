import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { NotebookScreen } from '../features/notebook/NotebookScreen.js';
import { ToastProvider } from '../components/ui/Toast.js';
import '../i18n/index.js';

describe('NotebookScreen Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <NotebookScreen />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

  it('renders Notebook with seeded calculation rows and columns', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Notebook')).toBeInTheDocument();
      expect(screen.getAllByText(/Diwali Advance Booking & Material Estimates/i).length).toBeGreaterThan(0);
    });

    // Check headers
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Item Description')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
  });

  it('evaluates math expression when editing a numeric cell', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Servo Motor 550W (Direct Drive)')).toBeInTheDocument();
    });

    // Find the cell displaying '120' and click it to start editing
    const cellValue = screen.getByText('120');
    fireEvent.click(cellValue);

    // An input should appear
    const input = screen.getByDisplayValue('120') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Type a math formula '10*2'
    fireEvent.change(input, { target: { value: '10*2' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // The cell should now display the evaluated result '20' and the formula hint '(10*2)'
    await waitFor(() => {
      expect(screen.getAllByText('20').length).toBeGreaterThan(0);
      expect(screen.getAllByText('(10*2)').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('adds a new calculation row', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Add Row')).toBeInTheDocument();
    });

    const addRowBtn = screen.getByText('Add Row');
    fireEvent.click(addRowBtn);

    await waitFor(() => {
      expect(screen.getByText('Row added')).toBeInTheDocument();
    });
  });

  it('supports undoing changes', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Add Row')).toBeInTheDocument();
    });

    const addRowBtn = screen.getByText('Add Row');
    fireEvent.click(addRowBtn);

    await waitFor(() => {
      expect(screen.getByText('Row added')).toBeInTheDocument();
    });

    const undoBtn = screen.getByLabelText('Undo');
    expect(undoBtn).not.toBeDisabled();
    fireEvent.click(undoBtn);

    await waitFor(() => {
      expect(screen.getByText('Undone')).toBeInTheDocument();
    });
  });

  it('triggers CSV download on button click', async () => {
    // Mock URL methods
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('CSV')).toBeInTheDocument();
    });

    const csvBtn = screen.getByText('CSV');
    fireEvent.click(csvBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Exported CSV')).toBeInTheDocument();
    });
  });
});
