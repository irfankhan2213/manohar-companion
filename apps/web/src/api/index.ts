import { ApiClient } from './client.js';
import { mockApiClient } from '../mock/db.js';
import { httpApiClient } from './http.js';

const isRealMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const urlParam = new URLSearchParams(window.location.search).get('backend');
  if (urlParam === 'real') return true;
  if (urlParam === 'mock') return false;
  const stored = localStorage.getItem('manohar_backend_mode');
  if (stored === 'real') return true;
  return (import.meta as any).env?.VITE_USE_MOCK === 'false';
};

export const api: ApiClient = isRealMode() ? httpApiClient : mockApiClient;
export { mockApiClient } from '../mock/db.js';
export { httpApiClient } from './http.js';
export * from './client.js';
