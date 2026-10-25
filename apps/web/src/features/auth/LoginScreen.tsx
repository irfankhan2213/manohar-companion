import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Lock,
  Phone,
  Eye,
  EyeOff,
  ShieldCheck,
  Building2,
  UserCheck,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { Button } from '../../components/ui/Button.js';
import { useToast } from '../../components/ui/Toast.js';

export const LoginScreen: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { login, staySignedIn, setStaySignedIn } = useAppStore();

  const [phone, setPhone] = useState('+91 98140 11223');
  const [pin, setPin] = useState('1234');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => api.auth.login(phone, pin),
    onSuccess: (data) => {
      if (!data.success || !data.user || !data.token) {
        setErrorMessage(data.error || 'Authentication failed');
        return;
      }
      setErrorMessage(null);
      const defaultComp = data.companies?.[0]?.id || 'c1';
      login(data.token, data.user, data.tenant, defaultComp);

      showToast({
        message: `Welcome back, ${data.user.name} (${data.user.role.toUpperCase()})`,
        variant: 'success',
      });

      if (data.user.role === 'dev') {
        navigate('/dev/clients');
      } else {
        navigate('/');
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Login failed. Please check phone and PIN.');
    },
  });

  const handleQuickLogin = (p: string, code: string) => {
    setPhone(p);
    setPin(code);
    setErrorMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !pin.trim()) {
      setErrorMessage('Please enter both mobile number and 4-digit PIN');
      return;
    }
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* App Brand Header */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-accent text-white flex items-center justify-center shadow-md mb-1">
            <Building2 className="w-9 h-9 stroke-[2.2]" />
          </div>
          <h1 className="text-large-title font-bold text-label tracking-tight">
            Manohar Companion
          </h1>
          <p className="text-footnote text-label-2 max-w-[280px]">
            Tally-connected mobile & desktop companion for real-time stock, challans & collections
          </p>
        </div>

        {/* Login Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-2xl border border-separator/40 shadow-sm p-5 flex flex-col gap-4"
        >
          {errorMessage && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-caption font-semibold flex items-start gap-2">
              <span className="shrink-0 text-base">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Phone Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
              Registered Phone Number
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-fill border border-separator/50 focus-within:border-accent focus-within:bg-surface transition-all">
              <Phone className="w-4 h-4 text-label-3 shrink-0" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="+91 98140 11223"
                className="w-full bg-transparent text-subhead font-semibold text-label focus:outline-none"
                required
              />
            </div>
          </div>

          {/* PIN Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-bold text-label-2 uppercase tracking-wide">
              4-Digit PIN
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-fill border border-separator/50 focus-within:border-accent focus-within:bg-surface transition-all">
              <Lock className="w-4 h-4 text-label-3 shrink-0" />
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="••••"
                className="w-full bg-transparent text-subhead font-mono font-bold tracking-widest text-label focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-label-3 hover:text-label p-1"
                aria-label="Toggle PIN visibility"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Stay Signed In Toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer py-1 select-none">
            <input
              type="checkbox"
              checked={staySignedIn}
              onChange={(e) => setStaySignedIn(e.target.checked)}
              className="w-4 h-4 rounded text-accent focus:ring-accent accent-accent cursor-pointer"
            />
            <span className="text-footnote font-medium text-label-2">
              Stay signed in on this device
            </span>
          </label>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full flex items-center justify-center gap-2 font-bold mt-1 h-12 text-body"
          >
            {loginMutation.isPending ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        {/* Quick Demo Switcher */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold text-center text-label-3 uppercase tracking-wider">
            Quick 1-Tap Demo Accounts
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('+91 99999 00000', '0000')}
              className="p-2.5 rounded-xl bg-surface border border-separator/40 hover:border-accent flex flex-col text-left transition-all active:scale-95"
            >
              <div className="flex items-center gap-1.5 text-accent">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-caption font-bold">Dev Super Admin</span>
              </div>
              <span className="text-[11px] text-label-2 mt-0.5">Onboard Clients (PIN: 0000)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('+91 98140 11223', '1234')}
              className="p-2.5 rounded-xl bg-surface border border-separator/40 hover:border-accent flex flex-col text-left transition-all active:scale-95"
            >
              <div className="flex items-center gap-1.5 text-ok">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="text-caption font-bold">Manohar Lal</span>
              </div>
              <span className="text-[11px] text-label-2 mt-0.5">Client Owner (PIN: 1234)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('+91 98765 22334', '1234')}
              className="p-2.5 rounded-xl bg-surface border border-separator/40 hover:border-accent flex flex-col text-left transition-all active:scale-95"
            >
              <div className="flex items-center gap-1.5 text-label">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span className="text-caption font-bold">Priya Sharma</span>
              </div>
              <span className="text-[11px] text-label-2 mt-0.5">Admin Staff (PIN: 1234)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('+91 98222 44556', '1234')}
              className="p-2.5 rounded-xl bg-surface border border-separator/40 hover:border-accent flex flex-col text-left transition-all active:scale-95"
            >
              <div className="flex items-center gap-1.5 text-label">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-caption font-bold">Amit Verma</span>
              </div>
              <span className="text-[11px] text-label-2 mt-0.5">Sales Staff (PIN: 1234)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
