import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../app/store.js';
import { api } from '../../api/index.js';
import { Sheet } from './Sheet.js';
import { Button } from './Button.js';
import { useToast } from './Toast.js';
import { Role } from '@saas/shared';

export const UserAuthMenu: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, currentTenant, logout } = useAppStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

  const getRoleBadgeColor = (role: Role) => {
    switch (role) {
      case 'dev':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'owner':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'admin':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'accounts':
        return 'bg-ok/10 text-ok border-ok/20';
      case 'sales':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'stock_keeper':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-fill text-label-2 border-separator/40';
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {}
    logout();
    setOpen(false);
    showToast({ message: 'Signed out successfully' });
    navigate('/login');
  };

  if (!currentUser) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Staff account menu"
        className="flex items-center gap-1.5 h-9 px-2 rounded-xl bg-surface/80 border border-separator/40 shadow-sm active:scale-95 transition-all text-left"
      >
        <div className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center font-bold text-caption shrink-0">
          {currentUser.name.charAt(0)}
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="text-caption font-semibold text-label leading-tight truncate max-w-[90px]">
            {currentUser.name.split(' ')[0]}
          </span>
          <span className="text-[10px] text-label-3 capitalize leading-none">
            {currentUser.role.replace('_', ' ')}
          </span>
        </div>
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Account & Profile"
      >
        <div className="p-4 flex flex-col gap-4">
          {/* Active Profile Card */}
          <div className="p-4 bg-fill/40 rounded-2xl border border-separator/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-bold text-title-3 shadow-sm shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="flex flex-col">
                <span className="text-headline font-bold text-label">{currentUser.name}</span>
                <span className="text-caption text-label-2">{currentUser.phone}</span>
                {currentTenant?.name && (
                  <span className="text-[11px] text-label-3 mt-0.5">{currentTenant.name}</span>
                )}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-caption font-bold border capitalize ${getRoleBadgeColor(
                currentUser.role
              )}`}
            >
              {currentUser.role.replace('_', ' ')}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="p-3 bg-surface hover:bg-fill/50 active:bg-fill/80 rounded-xl border border-separator/40 flex items-center justify-between transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 text-subhead font-semibold text-label">
                <Settings className="w-4 h-4 text-accent" />
                <span>Account & Organization Settings</span>
              </div>
              <span className="text-caption text-label-3">Manage →</span>
            </button>

            {currentUser.role === 'dev' && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/dev/clients');
                }}
                className="p-3 bg-surface hover:bg-fill/50 active:bg-fill/80 rounded-xl border border-separator/40 flex items-center justify-between transition-colors text-left"
              >
                <div className="flex items-center gap-2.5 text-subhead font-semibold text-label">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span>Dev Client Organizations</span>
                </div>
                <span className="text-caption text-label-3">Manage →</span>
              </button>
            )}
          </div>

          {/* Logout Button */}
          <div className="pt-2">
            <Button
              variant="tinted"
              className="w-full text-danger flex items-center justify-center gap-2 h-11"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
};
