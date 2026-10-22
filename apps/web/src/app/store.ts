import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role, User, INITIAL_USERS } from '@saas/shared';
import i18n from '../i18n';

interface AppSessionState {
  currentCompanyId: string | 'all';
  currentUser: User;
  currentRole: Role;
  language: 'en' | 'hi';
  setCompanyId: (companyId: string | 'all') => void;
  setUser: (user: User) => void;
  setRole: (role: Role) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
  logout: () => void;
}

export const useAppStore = create<AppSessionState>()(
  persist(
    (set) => ({
      currentCompanyId: 'c1',
      currentUser: INITIAL_USERS[0]!, // Manohar Lal (Owner)
      currentRole: INITIAL_USERS[0]!.role,
      language: 'en',
      setCompanyId: (companyId) => set({ currentCompanyId: companyId }),
      setUser: (user) => set({ currentUser: user, currentRole: user.role }),
      setRole: (role) => set({ currentRole: role }),
      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
      logout: () => {
        set({ currentUser: INITIAL_USERS[0]!, currentRole: 'owner' });
      },
    }),
    {
      name: 'manohar-session-v2',
    }
  )
);
