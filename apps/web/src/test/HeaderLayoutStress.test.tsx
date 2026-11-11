import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LargeTitleScreen } from '../components/ui/LargeTitleScreen.js';
import { CompanyMenu } from '../components/ui/CompanyMenu.js';
import { NotificationBell } from '../components/ui/NotificationBell.js';
import { UserAuthMenu } from '../components/ui/UserAuthMenu.js';
import { useAppStore } from '../app/store.js';
import { api } from '../api/index.js';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe('Milestone 1 Header Layout Adversarial Stress Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('LargeTitleScreen enforces correct flex shrinkage, bounds, and responsive padding', () => {
    const queryClient = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LargeTitleScreen
            title="Dashboard"
            showBack={true}
            headerAction={<button id="test-action">Action</button>}
          >
            <div>Content</div>
          </LargeTitleScreen>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 1. Header row padding and gap
    const headerRow = container.querySelector('header > div');
    expect(headerRow).toBeInTheDocument();
    expect(headerRow?.className).toContain('px-3');
    expect(headerRow?.className).toContain('sm:px-5');
    expect(headerRow?.className).toContain('gap-1.5');
    expect(headerRow?.className).toContain('sm:gap-2');

    // 2. Left container flex-1 min-w-0 propagation
    const leftContainer = headerRow?.children[0];
    expect(leftContainer?.className).toContain('min-w-0');
    expect(leftContainer?.className).toContain('flex-1');

    // 3. Back button shrink-0 and responsive margin/padding
    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton.className).toContain('shrink-0');
    expect(backButton.className).toContain('-ml-1');
    expect(backButton.className).toContain('sm:-ml-2.5');
    expect(backButton.className).toContain('px-1.5');
    expect(backButton.className).toContain('sm:px-2');

    // 4. Right action container shrink-0 and gap
    const rightContainer = headerRow?.children[1];
    expect(rightContainer?.className).toContain('shrink-0');
    expect(rightContainer?.className).toContain('gap-1');
    expect(rightContainer?.className).toContain('sm:gap-1.5');
  });

  it('CompanyMenu propagates min-w-0 through all intermediate flex divs to truncated name', () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyMenu />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const triggerButton = screen.getByRole('button', { name: /Select company/i });
    expect(triggerButton).toBeInTheDocument();

    // Trigger button has min-w-0 and max-w-full
    expect(triggerButton.className).toContain('min-w-0');
    expect(triggerButton.className).toContain('max-w-full');

    // Intermediate wrapper divs have min-w-0
    const innerCol = triggerButton.querySelector('.flex.flex-col');
    expect(innerCol?.className).toContain('min-w-0');

    const topRow = innerCol?.querySelector('.flex.items-center');
    expect(topRow?.className).toContain('min-w-0');

    // Company name span has truncate, min-w-0, and responsive max-width
    const nameSpan = topRow?.querySelector('span');
    expect(nameSpan?.className).toContain('truncate');
    expect(nameSpan?.className).toContain('min-w-0');
    expect(nameSpan?.className).toContain('max-w-[115px]');
    expect(nameSpan?.className).toContain('sm:max-w-[200px]');
  });

  it('Stress-tests adversarial company name of 300 characters without breaking flex bounds', async () => {
    const queryClient = createTestQueryClient();
    const extremeCompanyName = 'Supercalifragilisticexpialidocious_Enterprise_Global_Trading_And_Wholesale_Logistics_Group_LLC_'.repeat(3);

    vi.spyOn(api.companies, 'list').mockResolvedValueOnce([
      {
        id: 'c1',
        name: extremeCompanyName,
        financialYear: '2024-2025',
        agentStatus: 'online',
      } as any,
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyMenu />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const triggerButton = screen.getByRole('button', { name: /Select company/i });
    await waitFor(() => {
      expect(triggerButton).toHaveTextContent(/Supercalifragilisticexpialidocious/);
    });

    const nameSpan = triggerButton.querySelector('span');
    expect(nameSpan?.className).toContain('truncate');
    expect(nameSpan?.className).toContain('min-w-0');
    expect(nameSpan?.className).toContain('max-w-[115px]');
    expect(nameSpan?.className).toContain('sm:max-w-[200px]');
  });

  it('CompanyMenu dropdown content includes collisionPadding and mobile max-width guardrails', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyMenu />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const triggerButton = screen.getByRole('button', { name: /Select company/i });
    // In Radix UI, ArrowDown opens dropdown menu reliably in jsdom
    fireEvent.keyDown(triggerButton, { key: 'ArrowDown', code: 'ArrowDown' });

    await waitFor(() => {
      const menuContent = document.querySelector('[role="menu"]');
      expect(menuContent).toBeInTheDocument();
      expect(menuContent?.className).toContain('max-w-[calc(100vw-24px)]');
      expect(menuContent?.className).toContain('min-w-[200px]');
      expect(menuContent?.className).toContain('sm:min-w-[220px]');
    });
  });

  it('NotificationBell badge has pointer-events-none and remains within trigger boundaries even with 4-digit badge', async () => {
    const queryClient = createTestQueryClient();
    const currentUser = useAppStore.getState().currentUser;

    const mockNotifications = Array.from({ length: 1250 }, (_, i) => ({
      id: `test-n-${i}`,
      companyId: 'c1',
      userId: currentUser?.id,
      type: 'task_assigned',
      title: `Task ${i}`,
      body: 'Do something',
      createdAt: new Date().toISOString(),
      read: false,
    }));

    vi.spyOn(api.notifications, 'list').mockResolvedValueOnce(mockNotifications as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const bellButton = screen.getByRole('button', { name: /Notifications/i });
    expect(bellButton.className).toContain('shrink-0');

    await waitFor(() => {
      const badge = bellButton.querySelector('span');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1250');
      expect(badge?.className).toContain('pointer-events-none');
      expect(badge?.className).toContain('top-0.5');
      expect(badge?.className).toContain('right-0.5');
    });

    // Clicking trigger opens the Notifications sheet
    fireEvent.click(bellButton);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('UserAuthMenu trigger retains shrink-0 and avatar accessibility', () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UserAuthMenu />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const userButton = screen.getByRole('button', { name: /Staff account menu/i });
    expect(userButton).toBeInTheDocument();
    expect(userButton.className).toContain('shrink-0');
  });
});
