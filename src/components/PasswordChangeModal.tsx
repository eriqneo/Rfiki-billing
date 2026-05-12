import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react';
import { db } from '../db/db';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { pb } from '../lib/pocketbase';

export function PasswordChangeModal() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!currentUser?.must_change_password) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    setLoading(true);
    try {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && pb.authStore.isValid) {
        // Only update PB if we have a valid token (they are logged in)
        try {
          await pb.collection('users').update(pb.authStore.model!.id, {
            password: password,
            passwordConfirm: password
          });
        } catch (pbErr) {
          console.error('Failed to sync password to PB', pbErr);
          // Don't throw, we still want to save to local DB
        }
      }

      await db.team_members.update(currentUser.id!, {
        password_hash: password,
        must_change_password: false
      });
      showToast('Password updated successfully', 'success');
      window.location.reload();
    } catch (e) {
      showToast('Failed to update password', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md glass-panel p-8 md:p-10 rounded-[2.5rem] border border-accent-green/20 shadow-[0_0_50px_rgba(57,255,20,0.05)] bg-bg-deep/95"
      >
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-500/20">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter mb-2">Security Required</h2>
          <p className="text-xs text-text-dim leading-relaxed">
            For your protection, please set a new permanent password before accessing the system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] ml-1">New Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
              <input 
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm font-bold text-text-main focus:outline-none focus:border-accent-green/50 transition-all"
                placeholder="••••••••"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim hover:text-accent-green transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] ml-1">Confirm Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
              <input 
                type={showPassword ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm font-bold text-text-main focus:outline-none focus:border-accent-green/50 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full bg-accent-green text-bg-deep font-black py-4 rounded-2xl uppercase tracking-[0.2em] shadow-neon hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Set Secure Password'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
