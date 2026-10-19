import { ApiClient } from './client.js';
import { mockApiClient } from '../mock/db.js';

export const api: ApiClient = mockApiClient;
export * from './client.js';
