import { ApiClient } from './client.js';
import { httpApiClient } from './http.js';
import { mockApiClient } from '../mock/db.js';

// Production & browser runtime always use real httpApiClient (no mock backdoor).
// Only Vitest test runner uses mockApiClient for offline component unit tests.
const isTestEnv = (import.meta as any).env?.MODE === 'test';

export const api: ApiClient = isTestEnv ? mockApiClient : httpApiClient;
export { httpApiClient } from './http.js';
export { mockApiClient } from '../mock/db.js';
export * from './client.js';
