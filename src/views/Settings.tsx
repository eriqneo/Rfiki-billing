import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TeamMember, type BusinessProfile } from '../db/db';
import { pb } from '../lib/pocketbase';
import {
  Users,
  Moon,
  Sun,
  Building2,
  Activity,
  Bell,
  Trash2,
  Plus,
  Save,
  Shield,
  Monitor,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  Database,
  Edit2,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Server,
  Lock,
  Unlock,
  ShieldAlert,
  Image as ImageIcon,
  Upload,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { useSync } from '../hooks/useSync';
import { useToast } from '../contexts/ToastContext';
import { motion, AnimatePresence } from 'motion/react';
import { addMonths } from 'date-fns';
import { usePbCollection } from '../hooks/usePbCollection';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';

export function Settings() {
  const { theme, setTheme } = useTheme();
  const { addEntity, isOnline, rebuildSyncQueue, processSyncQueue } = useSync();
  const { showToast } = useToast();
  const teamMembers = useLiveQuery(() => db.team_members.toArray());
  const business = useLiveQuery(() => db.business.limit(1).toArray());
  const { data: instances } = useUnifiedCollection<any>('pocket_host_instances', () => db.pocket_host_instances.toArray());
  const { currentUser, updateProfile } = useAuth();

  // My Profile State
  const [profileName, setProfileName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (currentUser?.name) setProfileName(currentUser.name);
  }, [currentUser?.name]);

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setIsSavingProfile(true);
    const success = await updateProfile(profileName.trim());
    setIsSavingProfile(false);
    if (success) showToast('Your name has been updated!', 'success');
    else showToast('Failed to update name.', 'error');
  };

  // Inventory State
  const [stockPrefix, setStockPrefix] = useState('host-unit-');
  const [stockCount, setStockCount] = useState('1');
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Team Form State
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userRole, setUserRole] = useState<'Admin' | 'Editor' | 'Viewer'>('Viewer');
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const { records: pbUsers } = usePbCollection<any>('users');

  // Business State
  const [bizName, setBizName] = useState('');
  const [bizTill, setBizTill] = useState('');
  const [bizCurrency, setBizCurrency] = useState('KES');
  const [bizLogo, setBizLogo] = useState('');
  const [isSavingBiz, setIsSavingBiz] = useState(false);
  const [showBizToast, setShowBizToast] = useState(false);

  // Mobile Expand State
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // SW Status
  const [swStatus, setSwStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [isRepairingSync, setIsRepairingSync] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{
    visible: boolean;
    status: 'running' | 'success' | 'error';
    title: string;
    message: string;
    progress: number;
  }>({
    visible: false,
    status: 'running',
    title: '',
    message: '',
    progress: 0
  });

  const MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'clients', label: 'Client Hub' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'meetings', label: 'Meetings' },
    { id: 'billing', label: 'Billing' },
    { id: 'pockethost', label: 'Pocket Host' },
    { id: 'agreements', label: 'Agreements' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' }
  ];

  const fetchPbUsers = async () => {};

  const handleTogglePermission = async (user: any, moduleId: string) => {
    if (user.role === 'Admin') return;

    const allModules = MODULES.map(m => m.id);
    let perms = user.module_permissions || [...allModules];

    if (perms.includes(moduleId)) {
      perms = perms.filter((m: string) => m !== moduleId);
    } else {
      perms = [...perms, moduleId];
    }

    if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
      try {
        await pb.collection('users').update(user.id, { module_permissions: perms });
        fetchPbUsers();
      } catch (e) {
        showToast('Failed to update permissions in PB', 'error');
      }
    } else {
      await db.team_members.update(user.id!, { module_permissions: perms });
    }
  };

  const handleGrantAll = async (user: any) => {
    if (user.role === 'Admin') return;
    const perms = MODULES.map(m => m.id);
    if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
      await pb.collection('users').update(user.id, { module_permissions: perms });
      fetchPbUsers();
    } else {
      await db.team_members.update(user.id!, { module_permissions: perms });
    }
  };

  const handleRevokeAll = async (user: any) => {
    if (user.role === 'Admin') return;
    if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
      await pb.collection('users').update(user.id, { module_permissions: [] });
      fetchPbUsers();
    } else {
      await db.team_members.update(user.id!, { module_permissions: [] });
    }
  };

  useEffect(() => {
    if (business && business.length > 0) {
      setBizName(business[0].name);
      setBizTill(business[0].till_number);
      setBizCurrency(business[0].currency);
      if (business[0].logo_base64) {
        setBizLogo(business[0].logo_base64);
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwStatus('active'));
    } else {
      setSwStatus('inactive');
    }
  }, [business]);

  const handleBulkProvision = async () => {
    if (!stockPrefix || !stockCount) return;
    setIsProvisioning(true);

    const count = parseInt(stockCount);
    for (let i = 1; i <= count; i++) {
      const idx = (instances?.length || 0) + i;
      await addEntity('pocket_host_instances', {
        instance_name: `${stockPrefix}${idx}`,
        monthly_fee: 1500,
        billing_cycle: 'monthly',
        status: 'active',
        created_at: new Date().toISOString(),
        next_billing_date: addMonths(new Date(), 1).toISOString()
      });
    }

    setIsProvisioning(false);
    setStockCount('0');
    showToast(`Successfully added ${count} new hosting units to inventory.`, 'success');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName || !userEmail) return;

    if (userPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (editingId) {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        try {
          const updateData: any = {
            name: userName,
            email: userEmail,
            role: userRole,
          };
          if (userPassword) {
            updateData.password = userPassword;
            updateData.passwordConfirm = userPassword;
          }
          await pb.collection('users').update(editingId as string, updateData);
          fetchPbUsers();
          showToast('User updated in PocketBase', 'success');
        } catch (error: any) {
          showToast(`Update failed: ${error.message}`, 'error');
        }
      } else {
        const updateData: any = {
          name: userName,
          email: userEmail,
          role: userRole,
          synced: false
        };
        if (userPassword) {
          updateData.password_hash = userPassword;
        }
        await db.team_members.update(editingId as number, updateData);
      }
      setEditingId(null);
    } else {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        try {
          await pb.collection('users').create({
            username: userEmail.split('@')[0] + Math.floor(Math.random() * 1000),
            email: userEmail,
            password: userPassword || 'password123',
            passwordConfirm: userPassword || 'password123',
            name: userName,
            role: userRole,
            module_permissions: [],
            emailVisibility: true,
          });
          fetchPbUsers();
          showToast('User created in PocketBase', 'success');
        } catch (error: any) {
          showToast(`Creation failed: ${error.message}`, 'error');
        }
      } else {
        await db.team_members.add({
          name: userName,
          email: userEmail,
          role: userRole,
          password_hash: userPassword,
          must_change_password: true,
          synced: false
        });
      }
    }

    setUserName('');
    setUserEmail('');
    setUserPassword('');
    setConfirmPassword('');
    setUserRole('Viewer');
  };

  const handleRemoveUser = async (id: number | string) => {
    if (confirm('Are you sure you want to remove this team member?')) {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        try {
          await pb.collection('users').delete(id as string);
          fetchPbUsers();
          showToast('User removed from PocketBase', 'success');
        } catch (e) {
          showToast('Failed to remove user from PB', 'error');
        }
      } else {
        await db.team_members.delete(id as number);
      }
    }
  };

  const handleEditUser = (u: any) => {
    setUserName(u.name);
    setUserEmail(u.email);
    setUserRole(u.role);
    setEditingId(u.id!);
  };

  const handleSaveBusiness = async () => {
    if (bizTill && !/^\d+$/.test(bizTill)) {
      showToast('Mpesa Till/Paybill must contain numbers only.', 'error');
      return;
    }

    setIsSavingBiz(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        const pbData = { name: bizName, till_number: bizTill, currency: bizCurrency, logo_base64: bizLogo };

        // 1. Try to find existing record in PB regardless of local pb_id
        const records = await pb.collection('business').getFullList({ requestKey: 'save-biz' });

        if (records.length > 0) {
          const pbId = records[0].id;
          await pb.collection('business').update(pbId, pbData);

          // Update local DB
          const localBiz = await db.business.toCollection().first();
          if (localBiz) {
            await db.business.update(localBiz.id!, { ...pbData, pb_id: pbId, synced: true });
          } else {
            await db.business.add({ ...pbData, pb_id: pbId, synced: true });
          }
        } else {
          // No record in PB, create one
          const record = await pb.collection('business').create(pbData);
          const localBiz = await db.business.toCollection().first();
          if (localBiz) {
            await db.business.update(localBiz.id!, { ...pbData, pb_id: record.id, synced: true });
          } else {
            await db.business.add({ ...pbData, pb_id: record.id, synced: true });
          }
        }
      } else {
        const existing = await db.business.toCollection().first();
        if (existing) {
          await db.business.update(existing.id!, { name: bizName, till_number: bizTill, currency: bizCurrency, logo_base64: bizLogo, synced: false });
        } else {
          await db.business.add({ name: bizName, till_number: bizTill, currency: bizCurrency, logo_base64: bizLogo, synced: false });
        }
      }
      setShowBizToast(true);
      setTimeout(() => setShowBizToast(false), 3000);
    } catch (e: any) {
      showToast(`Failed to save: ${e.message}`, 'error');
    } finally {
      setIsSavingBiz(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBizLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Warning: This will clear all local data and reset the app. Are you sure?')) {
      await db.delete();
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleRepairSync = async () => {
    if (isRepairingSync) return;
    if (!confirm('This will re-examine all local records and re-queue any data that hasn\'t successfully reached the cloud. Continue?')) return;

    setIsRepairingSync(true);
    setSyncNotice({
      visible: true,
      status: 'running',
      title: 'Cloud Integrity Repair',
      message: 'Preparing local audit...',
      progress: 8
    });

    try {
      setSyncNotice(prev => ({ ...prev, message: 'Scanning local records for cloud gaps...', progress: 32 }));
      const reQueued = await rebuildSyncQueue({
        verifyCloud: true,
        collections: ['pocket_host_instances', 'clients', 'payments', 'expenses', 'billing_promises', 'agreements', 'meetings']
      });

      setSyncNotice(prev => ({
        ...prev,
        message: reQueued > 0 ? `Queued ${reQueued} local records for cloud upload...` : 'No missing local records found in this browser. Verifying sync queue...',
        progress: 68
      }));
      const syncSummary = await processSyncQueue();

      if (syncSummary?.failed) {
        throw new Error('PocketBase rejected some records. Confirm the cloud collection exists, then run repair again.');
      }

      setSyncNotice({
        visible: true,
        status: 'success',
        title: 'Sync Repair Complete',
        message: syncSummary?.processed
          ? `${syncSummary.processed} local records were pushed to the cloud.`
          : reQueued > 0 ? `${reQueued} records were queued for the next sync pass.` : 'Local records are aligned with the sync queue.',
        progress: 100
      });
      showToast(`Repair complete! Re-queued ${reQueued} items.`, 'success');
      window.setTimeout(() => {
        setSyncNotice(prev => prev.status === 'success' ? { ...prev, visible: false } : prev);
      }, 5000);
    } catch (error: any) {
      setSyncNotice({
        visible: true,
        status: 'error',
        title: 'Sync Repair Failed',
        message: error?.message || 'The cloud repair could not complete.',
        progress: 100
      });
      showToast('Sync repair failed', 'error');
    } finally {
      setIsRepairingSync(false);
    }
  };

  return (
    <div className="space-y-12 pb-24">
      <header>
        <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Settings</h1>
        <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Manage your business & team</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* My Profile Card */}
        <div className="md:col-span-2 glass-panel p-8 rounded-3xl border-accent-green/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-accent-green/20 border border-accent-green/30 flex items-center justify-center">
              <span className="text-accent-green font-black text-lg uppercase">{currentUser?.name?.charAt(0) || 'U'}</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-text-main uppercase tracking-widest">My Profile</h3>
              <p className="text-[9px] text-accent-green font-bold tracking-widest uppercase">{currentUser?.email} · {currentUser?.role}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Your Display Name</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveProfile()}
                placeholder="e.g. Erick Atura"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              />
              <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest">This name appears in greetings, e.g. "Good morning, Erick"</p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="self-end flex items-center gap-2 glass-panel !bg-accent-green text-bg-deep px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest neon-glow disabled:opacity-50"
            >
              {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSavingProfile ? 'Saving...' : 'Save Name'}
            </button>
          </div>
        </div>
        {/* PocketHost Inventory */}
        <div className="glass-panel p-8 rounded-3xl space-y-8 h-fit">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-accent-green" />
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Server Inventory</h3>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Stock Level</p>
                <p className="text-2xl font-black text-text-main tabular-nums">{instances?.filter(i => !i.client_id).length || 0}</p>
                <p className="text-[8px] text-accent-green font-bold uppercase mt-1">Available Units</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Assigned Servers</p>
                <p className="text-2xl font-black text-text-main tabular-nums">{instances?.filter(i => i.client_id).length || 0}</p>
                <p className="text-[8px] text-text-dim font-bold uppercase mt-1">Assigned</p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
              <h4 className="text-[10px] font-black text-text-main uppercase tracking-widest">Add Bulk Hosting Units</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Naming Prefix</label>
                  <input
                    type="text"
                    value={stockPrefix}
                    onChange={e => setStockPrefix(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-text-main focus:border-accent-green outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Units to Add</label>
                  <input
                    type="number"
                    value={stockCount}
                    onChange={e => setStockCount(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-text-main focus:border-accent-green outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleBulkProvision}
                disabled={isProvisioning || parseInt(stockCount) <= 0}
                className="w-full bg-accent-green text-bg-deep py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale"
              >
                {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isProvisioning ? 'Adding Units...' : 'Add to Inventory'}
              </button>
            </div>
          </div>
        </div>

        {/* Team Members */}
        <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-8 h-fit">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-accent-green" />
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Team Management</h3>
          </div>

          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Full Name"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <input
                  type="password"
                  placeholder={editingId ? "New Password (Optional)" : "Password"}
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
                />
                {userPassword && (
                  <div className="px-2 flex gap-1 items-center">
                    <div className={cn("h-1 flex-1 rounded-full", userPassword.length > 8 ? "bg-accent-green" : userPassword.length > 4 ? "bg-amber-500" : "bg-red-500")} />
                    <span className="text-[8px] font-bold uppercase tracking-widest text-text-dim">
                      {userPassword.length > 8 ? 'Strong' : userPassword.length > 4 ? 'Good' : 'Weak'}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <select
                value={userRole}
                onChange={e => setUserRole(e.target.value as any)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              >
                <option value="Viewer" className="bg-bg-deep">Viewer</option>
                <option value="Editor" className="bg-bg-deep">Editor</option>
                <option value="Admin" className="bg-bg-deep">Admin</option>
              </select>
              <button type="submit" className="glass-panel !bg-accent-green text-bg-deep px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest neon-glow">
                {editingId ? 'Save Changes' : 'Add User'}
              </button>
            </div>
          </form>

          {/* User Display: Table for Desktop, Card List for Mobile */}
          <div className="mt-8">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-text-dim/60 border-b border-white/5">
                    <th className="pb-4">Name</th>
                    <th className="pb-4">Role</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(import.meta.env.VITE_AUTH_MODE === 'pocketbase' ? pbUsers : teamMembers)?.map(u => (
                    <React.Fragment key={u.id}>
                      <tr>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-text-main">{u.name}</p>
                            {u.password_hash && <Shield className="w-3 h-3 text-accent-green opacity-50" />}
                          </div>
                          <p className="text-[9px] text-text-dim uppercase">{u.email}</p>
                        </td>
                        <td className="py-4">
                          <span className="text-[9px] font-black uppercase tracking-widest text-accent-green/60">{u.role}</span>
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {currentUser?.role === 'Admin' && (
                              <button
                                onClick={() => setExpandedId(expandedId === u.id ? null : u.id!)}
                                className="p-2 hover:text-accent-green transition-colors"
                                title="Module Permissions"
                              >
                                {expandedId === u.id ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <button onClick={() => handleEditUser(u)} className="p-2 hover:text-accent-green transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => u.id && handleRemoveUser(u.id)} className="p-2 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {expandedId === u.id && currentUser?.role === 'Admin' && (
                          <motion.tr
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                          >
                            <td colSpan={3} className="pb-4">
                              <div className="bg-text-main/5 rounded-2xl p-4 border border-text-main/10 mt-2">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-[10px] font-black text-text-main uppercase tracking-widest flex items-center gap-2">
                                    <ShieldAlert className="w-4 h-4 text-accent-green" />
                                    Module Access Controls
                                  </h4>
                                  <div className="flex items-center gap-3">
                                    {u.role === 'Admin' ? (
                                      <span className="text-[9px] font-black uppercase text-accent-green/60 italic">Admins always have full access</span>
                                    ) : (
                                      <>
                                        <button onClick={() => handleGrantAll(u)} className="text-[8px] font-black uppercase text-text-main hover:text-accent-green">Grant All</button>
                                        <span className="text-text-dim">|</span>
                                        <button onClick={() => handleRevokeAll(u)} className="text-[8px] font-black uppercase text-text-main hover:text-red-500">Revoke All</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {MODULES.map(mod => {
                                    const hasAccess = u.role === 'Admin' || (u.module_permissions ? u.module_permissions.includes(mod.id) : true);
                                    const isLocked = u.role === 'Admin';

                                    return (
                                      <button
                                        key={mod.id}
                                        disabled={isLocked}
                                        onClick={() => handleTogglePermission(u, mod.id)}
                                        className={cn(
                                          "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-2",
                                          hasAccess
                                            ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                                            : "bg-red-500/10 text-red-500 border-red-500/20 opacity-50 hover:opacity-100",
                                          isLocked && "opacity-50 cursor-not-allowed"
                                        )}
                                      >
                                        {hasAccess ? "✅" : "❌"} {mod.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden space-y-3">
              {(import.meta.env.VITE_AUTH_MODE === 'pocketbase' ? pbUsers : teamMembers)?.map(u => (
                <div key={u.id} className="glass-panel p-4 rounded-2xl space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between" onClick={() => setExpandedId(expandedId === u.id ? null : u.id!)}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-text-main">{u.name}</p>
                        {u.password_hash && <Shield className="w-3 h-3 text-accent-green opacity-50" />}
                      </div>
                      <span className="text-[8px] font-black uppercase text-accent-green/60">{u.role}</span>
                    </div>
                    {expandedId === u.id ? <ChevronUp className="w-4 h-4 text-text-dim" /> : <ChevronDown className="w-4 h-4 text-text-dim" />}
                  </div>

                  <AnimatePresence>
                    {expandedId === u.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="pt-4 border-t border-white/5 space-y-4"
                      >
                        <p className="text-[9px] text-text-dim uppercase font-bold tracking-widest">{u.email}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {currentUser?.role === 'Admin' && (
                            <button onClick={() => setExpandedId(expandedId === u.id ? null : u.id!)} className="flex flex-1 justify-center items-center gap-2 text-[10px] font-black text-text-main uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl">
                              {expandedId === u.id ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              Access
                            </button>
                          )}
                          <button onClick={() => handleEditUser(u)} className="flex flex-1 justify-center items-center gap-2 text-[10px] font-black text-text-main uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl">
                            <Edit2 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button onClick={() => u.id && handleRemoveUser(u.id)} className="flex flex-1 justify-center items-center gap-2 text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/5 px-4 py-2 rounded-xl">
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>

                        {/* Mobile Permissions Panel */}
                        {currentUser?.role === 'Admin' && (
                          <div className="mt-4 pt-4 border-t border-white/5">
                             <h4 className="text-[10px] font-black text-text-main uppercase tracking-widest flex items-center gap-2 mb-3">
                               <ShieldAlert className="w-3 h-3 text-accent-green" />
                               Module Access Controls
                             </h4>
                             <div className="flex flex-wrap gap-2">
                                {MODULES.map(mod => {
                                  const hasAccess = u.role === 'Admin' || (u.module_permissions ? u.module_permissions.includes(mod.id) : true);
                                  const isLocked = u.role === 'Admin';

                                  return (
                                    <button
                                      key={mod.id}
                                      disabled={isLocked}
                                      onClick={() => handleTogglePermission(u, mod.id)}
                                      className={cn(
                                        "px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all flex items-center gap-1",
                                        hasAccess
                                          ? "bg-accent-green/10 text-accent-green border-accent-green/20"
                                          : "bg-red-500/10 text-red-500 border-red-500/20 opacity-50 hover:opacity-100",
                                        isLocked && "opacity-50 cursor-not-allowed"
                                      )}
                                    >
                                      {hasAccess ? "✅" : "❌"} {mod.label}
                                    </button>
                                  );
                                })}
                             </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Business Profile */}
        <div className="glass-panel p-8 rounded-3xl space-y-8 h-fit relative">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-accent-green" />
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Business Profile</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Business Legal Name</label>
              <input
                type="text"
                value={bizName}
                onChange={e => setBizName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Business Logo</label>
              <div className="flex items-center gap-4">
                {bizLogo ? (
                  <div className="w-16 h-16 rounded-xl border border-white/10 overflow-hidden shrink-0 bg-white/5 relative group">
                    <img src={bizLogo} alt="Logo" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setBizLogo('')}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl border border-dashed border-white/20 shrink-0 bg-white/5 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-text-dim/50" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    id="logo-upload"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <label
                    htmlFor="logo-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-text-main uppercase tracking-widest hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Logo
                  </label>
                  <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest mt-2">Max size: 1MB. Recommended square format.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Mpesa Till/Paybill</label>
                <input
                  type="text"
                  value={bizTill}
                  onChange={e => setBizTill(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text-dim uppercase tracking-widest">Currency Unit</label>
                <select
                  value={bizCurrency}
                  onChange={e => setBizCurrency(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-text-main focus:border-accent-green outline-none"
                >
                  <option value="USD" className="bg-bg-deep">USD ($)</option>
                  <option value="KES" className="bg-bg-deep">KES (KSh)</option>
                  <option value="EUR" className="bg-bg-deep">EUR (€)</option>
                  <option value="GBP" className="bg-bg-deep">GBP (£)</option>
                </select>
              </div>
            </div>
            <button
              onClick={handleSaveBusiness}
              disabled={isSavingBiz}
              className="w-full bg-white/5 text-text-main border border-white/10 py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:border-accent-green transition-all flex items-center justify-center gap-2"
            >
              {isSavingBiz ? <Loader2 className="w-4 h-4 animate-spin text-accent-green" /> : <Shield className="w-4 h-4 text-accent-green" />}
              {isSavingBiz ? 'Saving...' : 'Save Business Profile'}
            </button>
          </div>

          {/* Success Toast */}
          <AnimatePresence>
            {showBizToast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-accent-green/10 border border-accent-green/30 backdrop-blur-xl px-4 py-2 rounded-full flex items-center gap-2 shadow-neon"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
                <span className="text-[8px] font-black text-accent-green uppercase tracking-widest">Business profile saved</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Settings */}
        <div className="glass-panel p-8 rounded-3xl space-y-8">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-accent-green" />
            <h3 className="text-sm font-black text-text-main uppercase tracking-widest">Theme Settings</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                "p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all",
                theme === 'dark' ? "bg-accent-green/10 border-accent-green text-accent-green shadow-neon" : "bg-white/5 border-white/10 text-text-dim hover:text-text-main"
              )}
            >
              <Moon className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-widest">Dark Mode</span>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={cn(
                "p-6 rounded-2xl border flex flex-col items-center gap-4 transition-all",
                theme === 'light' ? "bg-accent-green/10 border-accent-green text-accent-green shadow-neon" : "bg-white/5 border-white/10 text-text-dim hover:text-text-main"
              )}
            >
              <Sun className="w-6 h-6" />
              <span className="text-[10px] font-black uppercase tracking-widest">Light Mode</span>
            </button>
          </div>
        </div>

        {/* System Health */}
        <div className="md:col-span-2 glass-panel p-8 rounded-3xl space-y-8 border-dashed">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-accent-green" />
              <h3 className="text-sm font-black text-text-main uppercase tracking-widest">System Health</h3>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <div className="relative">
                   <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-accent-green" : "bg-amber-500")} />
                   <div className={cn("absolute inset-0 rounded-full animate-ping", isOnline ? "bg-accent-green" : "bg-amber-500")} />
                </div>
                <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">
                  Network Connection: <span className={cn(isOnline ? "text-accent-green" : "text-amber-500")}>{isOnline ? 'Active' : 'Offline'}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <div className="relative">
                   <div className={cn("w-2 h-2 rounded-full", swStatus === 'active' ? "bg-accent-green" : "bg-amber-500")} />
                   <div className={cn("absolute inset-0 rounded-full animate-ping", swStatus === 'active' ? "bg-accent-green" : "bg-amber-500")} />
                </div>
                <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">
                  Offline Mode: <span className={cn(swStatus === 'active' ? "text-accent-green" : "text-text-dim")}>{swStatus === 'active' ? 'Ready' : swStatus.toUpperCase()}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 glass-panel rounded-2xl bg-red-500/5 border-red-500/20 group hover:border-red-500/40 transition-all">
               <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Reset App Data</h4>
               <p className="text-[9px] text-text-dim uppercase leading-relaxed mb-4">Clear all locally stored data and restart the app fresh</p>
               <button
                onClick={handleClearCache}
                className="flex items-center gap-2 text-red-500 text-[10px] font-black uppercase tracking-widest"
               >
                 <Trash2 className="w-3 h-3" />
                 Reset & Clear Data
               </button>
            </div>
            <div className="p-6 glass-panel rounded-2xl bg-accent-green/5 border-accent-green/20">
               <h4 className="text-[10px] font-black text-accent-green uppercase tracking-widest mb-2">Sync Consistency</h4>
               <p className="text-[9px] text-text-dim uppercase leading-relaxed mb-4">Re-examine local records and push any orphaned data to the cloud.</p>
               <button
                onClick={handleRepairSync}
                disabled={isRepairingSync}
                className="flex items-center gap-2 text-accent-green text-[10px] font-black uppercase tracking-widest hover:underline mb-4 disabled:opacity-50 disabled:cursor-wait"
               >
                 {isRepairingSync ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                 {isRepairingSync ? 'Repair In Progress' : 'Repair Cloud Integrity'}
               </button>
               <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                 <motion.div
                    animate={{ x: [-100, 400] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-1/4 h-full bg-accent-green shadow-neon"
                 />
               </div>
            </div>
          </div>
        </div>
      </div>

      <SystemSyncNotice
        notice={syncNotice}
        onClose={() => setSyncNotice(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}

function SystemSyncNotice({
  notice,
  onClose
}: {
  notice: {
    visible: boolean;
    status: 'running' | 'success' | 'error';
    title: string;
    message: string;
    progress: number;
  };
  onClose: () => void;
}) {
  const Icon = notice.status === 'success' ? CheckCircle2 : notice.status === 'error' ? ShieldAlert : Loader2;

  return (
    <AnimatePresence>
      {notice.visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-24 right-4 left-4 lg:left-auto lg:right-8 lg:bottom-8 z-[120] pointer-events-auto"
        >
          <div className={cn(
            "glass-panel !bg-bg-deep/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-5 w-full lg:w-[360px] overflow-hidden",
            notice.status === 'success' && "border-accent-green/30",
            notice.status === 'error' && "border-red-500/30"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0",
                notice.status === 'success' && "bg-accent-green/10 border-accent-green/30 text-accent-green",
                notice.status === 'error' && "bg-red-500/10 border-red-500/30 text-red-500",
                notice.status === 'running' && "bg-blue-500/10 border-blue-500/30 text-blue-400"
              )}>
                <Icon className={cn("w-5 h-5", notice.status === 'running' && "animate-spin")} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent-green mb-1">System Notification</p>
                    <h3 className="text-sm font-black uppercase tracking-widest text-text-main leading-tight">{notice.title}</h3>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-text-dim hover:text-text-main transition-colors p-1 -mt-1"
                    aria-label="Dismiss sync notification"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mt-3 leading-relaxed">
                  {notice.message}
                </p>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-text-dim">
                    <span>Progress</span>
                    <span className="text-accent-green">{Math.round(notice.progress)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                    <motion.div
                      className={cn(
                        "h-full rounded-full",
                        notice.status === 'error' ? "bg-red-500" : "bg-accent-green shadow-neon"
                      )}
                      initial={false}
                      animate={{ width: `${notice.progress}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
