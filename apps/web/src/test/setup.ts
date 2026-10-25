import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';
import { useAppStore } from '../app/store.js';
import { INITIAL_USERS, INITIAL_TENANTS } from '@saas/shared';

beforeEach(() => {
  useAppStore.getState().login(
    'test-token',
    INITIAL_USERS[1] || INITIAL_USERS[0]!,
    INITIAL_TENANTS[0],
    'c1'
  );
});
