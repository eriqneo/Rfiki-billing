import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { Lock, Mail, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(false);
    
    // Simulate slight network delay for premium feel
    await new Promise(r => setTimeout(r, 600));
    
    const success = await login(email, password);
    if (!success) {
      setError(true);
      // Remove error shake after animation
      setTimeout(() => setError(false), 500);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg-deep flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans text-text-main selection:bg-accent-green selection:text-bg-deep">
      {/* Premium ambient background */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent-green blur-[120px] rounded-full animate-pulse opacity-20" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent-green blur-[100px] rounded-full animate-pulse opacity-10" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={cn(
          "w-full max-w-md relative z-10",
          error && "animate-[shake_0.5s_ease-in-out]"
        )}
      >
        <div className="glass-panel p-8 md:p-12 rounded-[2.5rem] border border-accent-green/20 shadow-[0_0_50px_rgba(57,255,20,0.05)] bg-bg-deep/80 backdrop-blur-xl">
          
          <div className="flex flex-col items-center mb-10">
            <h1 className="text-4xl font-black text-accent-green tracking-tighter drop-shadow-neon mb-2">Rafiki.</h1>
            <p className="text-[10px] font-bold text-text-dim uppercase tracking-[0.3em]">Business Manager</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-text-main focus:outline-none focus:border-accent-green/50 transition-all placeholder:text-text-dim/30"
                  placeholder="admin@rafiki.app"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] ml-1">Secure Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm font-bold text-text-main focus:outline-none focus:border-accent-green/50 transition-all placeholder:text-text-dim/30"
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

            {error && (
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center animate-pulse">
                Invalid Credentials
              </p>
            )}

            <button 
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-accent-green text-bg-deep font-black py-4 rounded-2xl uppercase tracking-[0.2em] shadow-neon hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center mt-4"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate'}
            </button>
          </form>

        </div>
        
        <div className="mt-8 text-center">
          <p className="text-[8px] font-bold text-text-dim/50 uppercase tracking-[0.4em]">
            Rafiki Protocol &copy; 2026
          </p>
        </div>
      </motion.div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
