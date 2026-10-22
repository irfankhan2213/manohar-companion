import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserCheck, LogOut, KeyRound } from 'lucide-react';
import { useAppStore } from '../../app/store.js';
import { api } from '../../api/index.js';
import { Sheet } from './Sheet.js';
import { Button } from './Button.js';
import { useToast } from './Toast.js';
import { User, Role } from '@saas/shared';

export const UserAuthMenu: React.FC = () => {
  const { currentUser, setUser, logout } = useAppStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [selectedUserToSwitch, setSelectedUserToSwitch] = useState<User | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const getRoleBadgeColor = (role: Role) => {
    switch (role) {
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

  const handleSwitchUser = (targetUser: User) => {
    // If switching to owner/admin, verify PIN (or default 1234)
    if (targetUser.role === 'owner' || targetUser.role === 'admin') {
      setSelectedUserToSwitch(targetUser);
      setPinInput('');
    } else {
      setUser(targetUser);
      showToast({ message: `Switched active profile to ${targetUser.name} (${targetUser.role})` });
      setOpen(false);
    }
  };

  const handleConfirmPinSwitch = () => {
    if (!selectedUserToSwitch) return;
    if (pinInput.trim() === '1234' || pinInput.trim() === selectedUserToSwitch.pin || !selectedUserToSwitch.pin) {
      setUser(selectedUserToSwitch);
      showToast({ message: `Logged in as ${selectedUserToSwitch.name} (${selectedUserToSwitch.role})` });
      setSelectedUserToSwitch(null);
      setPinInput('');
      setOpen(false);
    } else {
      showToast({ message: 'Incorrect PIN. Default is 1234.' });
    }
  };

  const user = currentUser || users[0];
  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Staff account menu"
        className="flex items-center gap-1.5 h-9 px-2 rounded-xl bg-surface/80 border border-separator/40 shadow-sm active:scale-95 transition-all text-left"
      >
        <div className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center font-bold text-caption shrink-0">
          {user.name.charAt(0)}
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="text-caption font-semibold text-label leading-tight truncate max-w-[90px]">
            {user.name.split(' ')[0]}
          </span>
          <span className="text-[10px] text-label-3 capitalize leading-none">
            {user.role.replace('_', ' ')}
          </span>
        </div>
      </button>

      <Sheet
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setSelectedUserToSwitch(null);
        }}
        title="Staff Profile & Security"
      >
        <div className="p-4 flex flex-col gap-4">
          {/* Active Profile Header */}
          <div className="p-3.5 bg-fill/40 rounded-2xl border border-separator/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center font-bold text-headline shadow-sm shrink-0">
                {user.name.charAt(0)}
              </div>
              <div className="flex flex-col">
                <span className="text-headline font-bold text-label">{user.name}</span>
                <span className="text-caption text-label-2">{user.phone}</span>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-caption font-bold border capitalize ${getRoleBadgeColor(
                user.role
              )}`}
            >
              {user.role.replace('_', ' ')}
            </span>
          </div>

          {/* PIN Verification Sheet if switching to Admin/Owner */}
          {selectedUserToSwitch ? (
            <div className="p-4 bg-surface rounded-2xl border border-accent/30 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-accent">
                <KeyRound className="w-5 h-5" />
                <span className="text-subhead font-bold">
                  Enter 4-Digit Security PIN
                </span>
              </div>
              <p className="text-caption text-label-2">
                Switching to <strong>{selectedUserToSwitch.name}</strong> ({selectedUserToSwitch.role}) requires your 4-digit staff PIN. (Default test PIN is <code>1234</code>).
              </p>
              <input
                type="password"
                maxLength={4}
                autoFocus
                placeholder="••••"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full text-center tracking-widest text-title-1 font-mono h-12 bg-fill/50 rounded-xl border border-separator focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  variant="tinted"
                  className="flex-1"
                  onClick={() => setSelectedUserToSwitch(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={handleConfirmPinSwitch}
                  disabled={pinInput.length < 4}
                >
                  Verify & Switch
                </Button>
              </div>
            </div>
          ) : (
            /* Staff Switcher List */
            <div className="flex flex-col gap-2">
              <span className="text-caption font-semibold text-label-2 uppercase tracking-wider px-1">
                Switch Active Staff Profile
              </span>
              <div className="flex flex-col rounded-2xl bg-surface border border-separator/40 divide-y divide-separator/30 overflow-hidden">
                {users.map((u) => {
                  const isActive = u.id === user.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSwitchUser(u)}
                      className={`p-3 flex items-center justify-between text-left transition-colors active:bg-fill/60 ${
                        isActive ? 'bg-accent/5' : 'hover:bg-fill/30'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center font-bold text-caption shrink-0">
                          {u.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-subhead font-semibold text-label">
                            {u.name}
                          </span>
                          <span className="text-caption text-label-3">
                            {u.phone}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${getRoleBadgeColor(
                            u.role
                          )}`}
                        >
                          {u.role.replace('_', ' ')}
                        </span>
                        {isActive && (
                          <UserCheck className="w-4 h-4 text-accent" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Logout / Reset */}
          <div className="pt-2">
            <Button
              variant="tinted"
              className="w-full text-danger flex items-center justify-center gap-2"
              onClick={() => {
                logout();
                showToast({ message: 'Session reset to default profile' });
                setOpen(false);
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>Reset Profile to Owner</span>
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
};
