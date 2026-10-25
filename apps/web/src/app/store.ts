import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role, User, Tenant } from '@saas/shared';
import i18n from '../i18n';

// Clean up legacy prototype sessions from early development
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('manohar-session-v3');
    localStorage.removeItem('manohar-session-v2');
    localStorage.removeItem('manohar-session-v1');
  } catch {}
}

interface AppSessionState {
  authToken: string | null;
  currentTenant: Tenant | null;
  currentCompanyId: string | 'all';
  currentUser: User | null;
  currentRole: Role;
  language: 'en' | 'hi';
  staySignedIn: boolean;
  setCompanyId: (companyId: string | 'all') => void;
  setUser: (user: User) => void;
  setRole: (role: Role) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
  setStaySignedIn: (stay: boolean) => void;
  login: (token: string, user: User, tenant?: Tenant, defaultCompanyId?: string) => void;
  logout: () => void;
}

export const useAppStore = create<AppSessionState>()(
  persist(
    (set) => ({
      authToken: null,
      currentTenant: null,
      currentCompanyId: 'all',
      currentUser: null,
      currentRole: 'viewer',
      language: 'en',
      staySignedIn: true,
      setCompanyId: (companyId) => set({ currentCompanyId: companyId }),
      setUser: (user) => set({ currentUser: user, currentRole: user.role }),
      setRole: (role) => set({ currentRole: role }),
      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
      setStaySignedIn: (staySignedIn) => set({ staySignedIn }),
      login: (token, user, tenant, defaultCompanyId) => {
        set({
          authToken: token,
          currentUser: user,
          currentRole: user.role,
          currentTenant: tenant || null,
          currentCompanyId: defaultCompanyId || (user.companyIds === 'all' || !user.companyIds[0] ? 'c1' : user.companyIds[0]),
        });
      },
      logout: () => {
        set({
          authToken: null,
          currentUser: null,
          currentTenant: null,
          currentCompanyId: 'all',
          currentRole: 'viewer',
        });
      },
    }),
    {
      name: 'tally-auth-session-v1',
    }
  )
);
