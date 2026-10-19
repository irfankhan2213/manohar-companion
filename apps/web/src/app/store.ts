import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from '@saas/shared';
import i18n from '../i18n';

interface AppSessionState {
  currentCompanyId: string | 'all';
  currentRole: Role;
  language: 'en' | 'hi';
  setCompanyId: (companyId: string | 'all') => void;
  setRole: (role: Role) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
}

export const useAppStore = create<AppSessionState>()(
  persist(
    (set) => ({
      currentCompanyId: 'c1',
      currentRole: 'owner',
      language: 'en',
      setCompanyId: (companyId) => set({ currentCompanyId: companyId }),
      setRole: (role) => set({ currentRole: role }),
      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
    }),
    {
      name: 'manohar-session-v1',
    }
  )
);
