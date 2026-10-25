import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role, User, Tenant, INITIAL_USERS, INITIAL_TENANTS } from '@saas/shared';
import i18n from '../i18n';

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
      authToken: 'session-manohar-owner-init',
      currentTenant: INITIAL_TENANTS[0] || null,
      currentCompanyId: 'c1',
      currentUser: INITIAL_USERS[1] || INITIAL_USERS[0]!, // Manohar Lal (Owner) default
      currentRole: 'owner',
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
          currentCompanyId: 'c1',
          currentRole: 'viewer',
        });
      },
    }),
    {
      name: 'manohar-session-v3',
    }
  )
);
