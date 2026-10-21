import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../api/index.js';
import { resetMockDB } from '../mock/db.js';
import { ToastProvider } from '../components/ui/Toast.js';
import { TasksScreen } from '../features/tasks/TasksScreen.js';
import { ChallansScreen } from '../features/challans/ChallansScreen.js';
import { RemindersScreen } from '../features/reminders/RemindersScreen.js';

describe('Tasks, Challan Item Filters & Due Date System', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMockDB();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('renders Tasks screen with seeded tasks, photos, and handles new task assignment', async () => {
    renderWithProviders(<TasksScreen />);

    // Check seeded tasks
    await waitFor(() => {
      expect(
        screen.getByText(/Check needle plate & motor wiring on TAI MACHINE & SV MACHINE/i)
      ).toBeInTheDocument();
    });

    // Check staff assignee
    expect(screen.getByText(/Suresh Kumar/i)).toBeInTheDocument();

    // Check linked challan badge
    expect(screen.getByText(/Challan: DC\/045\/26-27/i)).toBeInTheDocument();

    // Open Assign Task Sheet
    const assignBtn = screen.getByRole('button', { name: /Assign Task/i });
    fireEvent.click(assignBtn);

    // Verify task creation sheet inputs
    expect(
      screen.getByText(/Assignee will receive a notification/i)
    ).toBeInTheDocument();
  });

  it('filters delivery challans by particular items like TAI MACHINE and SV MACHINE', async () => {
    renderWithProviders(<ChallansScreen />);

    // Verify challans list loaded
    await waitFor(() => {
      expect(screen.getByText('DC/045/26-27')).toBeInTheDocument();
    });

    // Check machine filter chips exist
    expect(screen.getByRole('button', { name: /^TAI MACHINE$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^SV MACHINE$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^130K MACHINE$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^TAI SET MACHINE$/i })).toBeInTheDocument();

    // Click TAI MACHINE filter chip
    const taiChip = screen.getByRole('button', { name: /^TAI MACHINE$/i });
    fireEvent.click(taiChip);

    // Check active filter text and that DC/045/26-27 is still visible
    await waitFor(() => {
      expect(
        screen.getByText(/Showing challans containing any of the 1 selected items/i)
      ).toBeInTheDocument();
      expect(screen.getByText('DC/045/26-27')).toBeInTheDocument();
    });
  });

  it('allows configuring Payment Due Date Rule (applied after X days) in Reminders', async () => {
    renderWithProviders(<RemindersScreen />);

    await waitFor(() => {
      expect(screen.getByText('Due Date Rule')).toBeInTheDocument();
    });

    // Click on Due Date Rule
    const ruleRow = screen.getByText('Due Date Rule');
    fireEvent.click(ruleRow);

    // Verify preset options: 7, 15, 30, 45, 60, 90 Days
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Payment Due Date Rule/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '15 Days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 Days' })).toBeInTheDocument();

    // Click 15 Days preset
    const preset15 = screen.getByRole('button', { name: '15 Days' });
    fireEvent.click(preset15);

    // Save Due Date Rule
    const saveBtn = screen.getByRole('button', { name: /Save Due Date Rule/i });
    fireEvent.click(saveBtn);

    // Verify rules updated in API
    await waitFor(async () => {
      const updated = await api.reminders.rules.get();
      expect(updated.defaultDueDays).toBe(15);
    });
  });
});

