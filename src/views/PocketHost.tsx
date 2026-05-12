import React, { useState } from 'react';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { db, type PocketHostInstance, type Client } from '../db/db';
import { Server, Plus, Search, Tag, Globe, Activity, Clock, Trash2, Edit2, X, LayoutGrid, List, ChevronLeft, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSync } from '../hooks/useSync';
import { pb } from '../lib/pocketbase';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths } from 'date-fns';
import { useToast } from '../contexts/ToastContext';

export function PocketHost() {
  const { data: instances } = useUnifiedCollection<PocketHostInstance>('pocket_host_instances', () => db.pocket_host_instances.toArray());
  const { data: clients } = useUnifiedCollection<any>('clients', () => db.clients.toArray());
  const { addEntity, updateEntity, deleteEntity, isOnline } = useSync();
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<PocketHostInstance | null>(null);
  const [deletingInstance, setDeletingInstance] = useState<PocketHostInstance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    selected_stock_id: '' as string | number,
    instance_name: '',
    client_id: '',
    monthly_fee: '1500',
    billing_cycle: 'monthly' as 'monthly' | 'quarterly' | 'semi-annual' | 'yearly',
    status: 'active' as 'active' | 'suspended' | 'trial',
  });

  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'assigned' | 'stock'>('assigned');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  const unassignedInstances = instances?.filter(i => !i.client_id) || [];
  
  const filteredInstances = instances?.filter(i => {
    const instanceStr = (i.instance_name || i.name || '').toLowerCase();
    const searchStr = (searchTerm || '').toLowerCase();
    const clientName = i.client_id ? (clients?.find(c => c.node_id === i.client_id)?.name || '').toLowerCase() : '';
    
    const matchesSearch = instanceStr.includes(searchStr) || clientName.includes(searchStr);
    const matchesCycle = !selectedCycle || i.billing_cycle === selectedCycle.toLowerCase();
    
    if (activeTab === 'assigned') return matchesSearch && matchesCycle && i.client_id;
    return matchesSearch && matchesCycle && !i.client_id;
  }) || [];

  const totalPages = Math.ceil(filteredInstances.length / ITEMS_PER_PAGE);
  const paginatedInstances = filteredInstances.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const filteredClients = clients?.filter(c => 
    (c.name || '').toLowerCase().includes((clientSearch || '').toLowerCase()) ||
    (c.node_id || '').toLowerCase().includes((clientSearch || '').toLowerCase())
  ).slice(0, 5);

  const handleOpenModal = (instance?: PocketHostInstance) => {
    if (instance) {
      setEditingInstance(instance);
      setFormData({
        selected_stock_id: instance.id || '',
        instance_name: instance.instance_name,
        client_id: instance.client_id || '',
        monthly_fee: instance.monthly_fee.toString(),
        billing_cycle: instance.billing_cycle || 'monthly',
        status: instance.status,
      });
      const client = clients?.find(c => c.node_id === instance.client_id);
      setClientSearch(client?.name || '');
    } else {
      setEditingInstance(null);
      setFormData({
        selected_stock_id: '',
        instance_name: '',
        client_id: '',
        monthly_fee: '1500',
        billing_cycle: 'monthly',
        status: 'active',
      });
      setClientSearch('');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data: any = {
      instance_name: formData.instance_name,
      client_id: formData.client_id || undefined,
      monthly_fee: Number(formData.monthly_fee),
      billing_cycle: formData.billing_cycle,
      status: formData.status,
      created_at: editingInstance?.created_at || new Date().toISOString(),
      next_billing_date: editingInstance?.next_billing_date || addMonths(new Date(), 1).toISOString(),
    };

    setIsModalOpen(false); // Optimistic close

    try {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        if (editingInstance) {
          const targetId = (editingInstance as any).id;
          const pbId = typeof targetId === 'string' ? targetId : editingInstance.pb_id;
          
          // 1. Cloud Update
          if (pbId) {
            await pb.collection('pocket_host_instances').update(pbId, data);
          }
          
          // 2. Local Update
          if (typeof targetId === 'number') {
            await db.pocket_host_instances.update(targetId, { ...data, synced: true });
          } else if (typeof targetId === 'string') {
            const local = await db.pocket_host_instances.where('pb_id').equals(targetId).first();
            if (local?.id) {
              await db.pocket_host_instances.update(local.id, { ...data, synced: true });
            }
          }
        } else if (formData.selected_stock_id) {
          // Updating from Stock (Assignment)
          const stockId = formData.selected_stock_id;
          
          // 1. Cloud Update
          let pbId = typeof stockId === 'string' ? stockId : null;
          if (!pbId && typeof stockId === 'number') {
            const local = await db.pocket_host_instances.get(stockId);
            pbId = local?.pb_id || null;
          }

          if (pbId) {
            await pb.collection('pocket_host_instances').update(pbId, data);
          }
          
          // 2. Local Update
          if (typeof stockId === 'number') {
            await db.pocket_host_instances.update(stockId, { ...data, synced: true });
          } else if (typeof stockId === 'string') {
            const local = await db.pocket_host_instances.where('pb_id').equals(stockId).first();
            if (local?.id) {
              await db.pocket_host_instances.update(local.id, { ...data, synced: true });
            }
          }
        } else {
          // New Creation
          const localId = await db.pocket_host_instances.add({ ...data, synced: false });
          const record = await pb.collection('pocket_host_instances').create(data);
          await db.pocket_host_instances.update(localId, { pb_id: record.id, synced: true });
        }
      } else {
        // Offline / Dexie-only mode
        if (editingInstance) {
          await updateEntity('pocket_host_instances', editingInstance.id!, data);
        } else if (formData.selected_stock_id) {
          await updateEntity('pocket_host_instances', Number(formData.selected_stock_id), data);
        } else {
          await addEntity('pocket_host_instances', data);
        }
      }
      showToast('Nodal configuration updated', 'success');
    } catch (err: any) {
      console.error('Failed to save instance:', err);
      showToast(err?.message || 'Sync Handshake failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (instance: PocketHostInstance) => {
    setDeletingInstance(instance);
  };

  const confirmDelete = async () => {
    if (!deletingInstance) return;
    
    try {
      const isPbMode = import.meta.env.VITE_AUTH_MODE === 'pocketbase';
      const idToDelete = (deletingInstance as any).id;

      // 1. Cloud Deletion
      if (isPbMode && isOnline) {
        const pbId = typeof idToDelete === 'string' ? idToDelete : (deletingInstance as any).pb_id;
        if (pbId) {
          await pb.collection('pocket_host_instances').delete(pbId);
        }
      }

      // 2. Local Deletion
      if (typeof idToDelete === 'number') {
        await deleteEntity('pocket_host_instances', idToDelete);
      } else if (typeof idToDelete === 'string') {
        const local = await db.pocket_host_instances.where('pb_id').equals(idToDelete).first();
        if (local?.id) {
          await deleteEntity('pocket_host_instances', local.id);
        }
      }

      showToast('PocketHost instance decommissioned', 'success');
    } catch (e) {
      console.error('Failed to decommission instance:', e);
      showToast('Decommission failure', 'error');
    } finally {
      setDeletingInstance(null);
    }
  };

  const unassignedCount = instances?.filter(i => !i.client_id).length || 0;
  const assignedCount = instances?.filter(i => i.client_id).length || 0;
  
  const monthlyTotal = instances?.filter(i => i.status === 'active' && i.client_id && i.billing_cycle === 'monthly').reduce((sum, i) => sum + i.monthly_fee, 0) || 0;
  const quarterlyTotal = instances?.filter(i => i.status === 'active' && i.client_id && i.billing_cycle === 'quarterly').reduce((sum, i) => sum + i.monthly_fee, 0) || 0;
  const semiAnnualTotal = instances?.filter(i => i.status === 'active' && i.client_id && i.billing_cycle === 'semi-annual').reduce((sum, i) => sum + i.monthly_fee, 0) || 0;
  const yearlyTotal = instances?.filter(i => i.status === 'active' && i.client_id && i.billing_cycle === 'yearly').reduce((sum, i) => sum + i.monthly_fee, 0) || 0;

  const totalMonthlyYield = monthlyTotal + (quarterlyTotal / 3) + (semiAnnualTotal / 6) + (yearlyTotal / 12);

  return (
    <div className="space-y-12 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter flex items-center gap-4">
            Pocket Host
            <Globe className="w-8 h-8 text-accent-green animate-pulse" />
          </h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Lifecycle & Inventory</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
            <input 
              type="text"
              placeholder="Probe instances..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl py-2.5 pl-12 pr-4 text-xs font-bold text-text-main focus:border-accent-green outline-none transition-all uppercase placeholder:text-text-dim/20"
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="text-[10px] font-black text-bg-deep uppercase tracking-[0.2em] bg-accent-green px-6 py-2.5 rounded-xl neon-glow flex items-center gap-2"
          >
            Provision New
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Inventory Monitor */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-2xl border-white/5">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Total Nodes</p>
          <p className="text-3xl font-black text-text-main tabular-nums">{instances?.length || 0}</p>
        </div>
        <div className="glass-panel p-6 rounded-2xl border-white/5 border-l-accent-green/40">
          <div className="text-[10px] font-black text-accent-green uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            Remaining Stock
            <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
          </div>
          <p className="text-3xl font-black text-accent-green tabular-nums">{unassignedCount}</p>
          <p className="text-[8px] text-text-dim font-bold uppercase mt-1 tracking-widest">Unassigned Instances</p>
        </div>
        <div className="glass-panel p-6 rounded-2xl border-white/5">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Assigned Fleet</p>
          <p className="text-3xl font-black text-text-main tabular-nums">{assignedCount}</p>
          <p className="text-[8px] text-text-dim font-bold uppercase mt-1 tracking-widest">Active Client Nodes</p>
        </div>
        <div className="glass-panel p-6 rounded-2xl border-white/5 bg-accent-green/[0.02]">
          <p className="text-[10px] font-black text-accent-green uppercase tracking-[0.2em] mb-2">Aggregate MRR</p>
          <p className="text-3xl font-black text-text-main tabular-nums">KSh {Math.round(totalMonthlyYield).toLocaleString()}</p>
          <p className="text-[8px] text-text-dim font-bold uppercase mt-1 tracking-widest">Normalized Yield</p>
        </div>
      </div>

      {/* Cycle Specific Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Monthly', value: monthlyTotal, icon: Clock },
          { label: 'Quarterly', value: quarterlyTotal, icon: Clock },
          { label: 'Semi-Annual', value: semiAnnualTotal, icon: Clock },
          { label: 'Yearly', value: yearlyTotal, icon: Globe },
        ].map((cycle, i) => (
          <button 
            key={i} 
            onClick={() => setSelectedCycle(selectedCycle === cycle.label ? null : cycle.label)}
            className={cn(
              "glass-panel p-4 rounded-xl border-white/5 flex items-center justify-between transition-all group hover:scale-[1.02] active:scale-95",
              selectedCycle === cycle.label ? "border-accent-green/50 bg-accent-green/[0.05] shadow-[0_0_20px_rgba(57,255,20,0.1)]" : "hover:border-white/10"
            )}
          >
            <div className="text-left">
              <p className={cn(
                "text-[8px] font-black uppercase tracking-widest mb-1 transition-colors",
                selectedCycle === cycle.label ? "text-accent-green" : "text-text-dim"
              )}>
                {cycle.label} Yield
              </p>
              <p className="text-sm font-black text-text-main tabular-nums">KSh {cycle.value.toLocaleString()}</p>
            </div>
            <cycle.icon className={cn(
              "w-4 h-4 transition-colors",
              selectedCycle === cycle.label ? "text-accent-green animate-pulse" : "text-text-dim/20 group-hover:text-text-dim/40"
            )} />
          </button>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-2xl w-fit border border-white/10">
          <button 
            onClick={() => setActiveTab('assigned')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'assigned' ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim hover:text-text-main"
            )}
          >
            Active Tenants ({assignedCount})
          </button>
          <button 
            onClick={() => setActiveTab('stock')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === 'stock' ? "bg-accent-green text-bg-deep shadow-neon" : "text-text-dim hover:text-text-main"
            )}
          >
            Reserve Stock ({unassignedCount})
          </button>
        </div>

        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
          <button 
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-2 rounded-lg transition-all",
              viewMode === 'grid' ? "bg-accent-green text-bg-deep" : "text-text-dim hover:text-text-main"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "p-2 rounded-lg transition-all",
              viewMode === 'list' ? "bg-accent-green text-bg-deep" : "text-text-dim hover:text-text-main"
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={cn(
        viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
          : "flex flex-col gap-3"
      )}>
        {paginatedInstances.map((instance) => {
          const client = clients?.find(c => c.node_id === instance.client_id);
          
          if (viewMode === 'list') {
            return (
              <motion.div 
                layout
                key={instance.id}
                className="glass-panel px-6 py-4 rounded-2xl border-white/5 group hover:border-accent-green/30 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border transition-all shrink-0",
                    instance.status === 'active' ? "bg-accent-green/10 border-accent-green/20" : "bg-white/5 border-white/10"
                  )}>
                    <Server className={cn("w-5 h-5", instance.status === 'active' ? "text-accent-green" : "text-text-dim")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black text-text-main uppercase tracking-widest truncate">{instance.instance_name}</h3>
                      {(instance as any).synced === false && (
                        <span className="text-[6px] px-1.5 py-0.5 rounded-full bg-amber-500 text-bg-deep font-black animate-pulse">LOCAL</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {instance.client_id && (
                        <div className="flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5 text-accent-green" />
                          <span className="text-[8px] font-black text-accent-green uppercase truncate max-w-[120px]">{client?.name || 'Assigned'}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-text-dim">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-bold uppercase tracking-tighter">
                          {instance.next_billing_date ? format(new Date(instance.next_billing_date), 'MMM dd') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8 shrink-0">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-text-main">KSh {instance.monthly_fee.toLocaleString()}</p>
                    <p className="text-[7px] text-accent-green font-bold uppercase tracking-widest">{instance.billing_cycle}</p>
                  </div>
                  
                  <div className="w-24 flex justify-center">
                    <span className={cn(
                      "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap",
                      instance.status === 'active' ? "border-accent-green/20 bg-accent-green/10 text-accent-green shadow-neon" :
                      instance.status === 'suspended' ? "border-red-500/20 bg-red-500/10 text-red-500" :
                      "border-amber-500/20 bg-amber-500/10 text-amber-500"
                    )}>
                      {instance.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                     <button 
                      onClick={() => handleOpenModal(instance)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-dim hover:text-accent-green transition-all"
                     >
                       <Edit2 className="w-3.5 h-3.5" />
                     </button>
                     <button 
                      onClick={() => handleDeleteRequest(instance)}
                      className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                     >
                       <X className="w-3.5 h-3.5" />
                     </button>
                  </div>
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div 
              layout
              key={instance.id}
              className="glass-panel p-6 rounded-3xl border-white/5 group hover:border-accent-green/30 transition-all cursor-default"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center border transition-all",
                    instance.status === 'active' ? "bg-accent-green/10 border-accent-green/20" : "bg-white/5 border-white/10"
                  )}>
                    <Server className={cn("w-5 h-5", instance.status === 'active' ? "text-accent-green" : "text-text-dim")} />
                  </div>
                  <div className="max-w-[150px]">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black text-text-main uppercase tracking-widest truncate">{instance.instance_name}</h3>
                      {(instance as any).synced === false && (
                        <span className="text-[6px] px-1.5 py-0.5 rounded-full bg-amber-500 text-bg-deep font-black animate-pulse">LOCAL</span>
                      )}
                    </div>
                    <p className="text-[8px] text-text-dim font-bold tracking-widest uppercase">PocketHost Subdomain</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => handleOpenModal(instance)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-dim hover:text-accent-green transition-all"
                   >
                     <Edit2 className="w-3.5 h-3.5" />
                   </button>
                   <button 
                    onClick={() => handleDeleteRequest(instance)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-text-dim hover:text-red-500 transition-all"
                   >
                     <Trash2 className="w-3.5 h-3.5" />
                   </button>
                </div>
              </div>

              <div className="space-y-4">
                {instance.client_id && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2">
                      <Tag className="w-3 h-3 text-accent-green" />
                      <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">Client Allocation</span>
                    </div>
                    <span className="text-[9px] font-black text-accent-green uppercase truncate max-w-[100px]">{client?.name || 'Assigned'}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                   <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Billing Yield</p>
                      <p className="text-xs font-black text-text-main">KSh {instance.monthly_fee.toLocaleString()}</p>
                      <p className="text-[7px] text-accent-green font-bold uppercase tracking-widest leading-none mt-1">{instance.billing_cycle}</p>
                   </div>
                   <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest mb-1">Status</p>
                      <span className={cn(
                        "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap inline-block mt-0.5",
                        instance.status === 'active' ? "border-accent-green/20 bg-accent-green/10 text-accent-green shadow-neon" :
                        instance.status === 'suspended' ? "border-red-500/20 bg-red-500/10 text-red-500" :
                        "border-amber-500/20 bg-amber-500/10 text-amber-500"
                      )}>
                        {instance.status}
                      </span>
                   </div>
                </div>

                <div className="flex items-center justify-between text-[8px] font-black text-text-dim uppercase tracking-widest pt-2">
                  <div className="flex items-center gap-1.5 transition-colors group-hover:text-text-main">
                    <Clock className="w-3 h-3" />
                    Billing: {instance.next_billing_date ? format(new Date(instance.next_billing_date), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                  <div className="flex items-center gap-1.5 transition-colors group-hover:text-accent-green">
                    <Activity className="w-3 h-3" />
                    Live Trace
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}

        {(!filteredInstances || filteredInstances.length === 0) && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-30 grayscale pointer-events-none">
            <Server className="w-12 h-12 mb-4" />
            <p className="text-xs font-black uppercase tracking-[.4em]">
              {activeTab === 'assigned' 
                ? 'No Assigned Instances' 
                : 'No Instances in Stock'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-8 border-t border-white/5">
          <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">
            Showing <span className="text-text-main">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="text-text-main">{Math.min(currentPage * ITEMS_PER_PAGE, filteredInstances.length)}</span> of <span className="text-text-main">{filteredInstances.length}</span> Nodes
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-2 rounded-xl border border-white/10 text-text-dim hover:text-accent-green disabled:opacity-20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {(() => {
                const pages = [];
                const maxVisible = 5;
                let start = Math.max(1, currentPage - 2);
                let end = Math.min(totalPages, start + maxVisible - 1);
                
                if (end - start < maxVisible - 1) {
                  start = Math.max(1, end - maxVisible + 1);
                }

                if (start > 1) {
                  pages.push(1);
                  if (start > 2) pages.push('...');
                }

                for (let i = start; i <= end; i++) {
                  pages.push(i);
                }

                if (end < totalPages) {
                  if (end < totalPages - 1) pages.push('...');
                  pages.push(totalPages);
                }

                return pages.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => typeof p === 'number' && setCurrentPage(p)}
                    disabled={typeof p !== 'number'}
                    className={cn(
                      "w-8 h-8 rounded-lg text-[10px] font-black transition-all",
                      currentPage === p 
                        ? "bg-accent-green text-bg-deep shadow-neon" 
                        : typeof p === 'number' 
                          ? "text-text-dim hover:bg-white/5 hover:text-text-main"
                          : "text-text-dim/30 cursor-default"
                    )}
                  >
                    {p}
                  </button>
                ));
              })()}
            </div>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl border border-white/10 text-text-dim hover:text-accent-green disabled:opacity-20 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-bg-deep/90 backdrop-blur-[10px]"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl glass-panel !bg-bg-deep/95 rounded-[2.5rem] border-accent-green/30 shadow-[0_0_50px_rgba(0,0,0,0.3)] overflow-hidden"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                    <Server className="w-5 h-5 text-accent-green" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-text-main uppercase tracking-tighter">Instance Provisioning</h2>
                    <p className="text-[8px] text-text-dim font-bold tracking-[0.3em] uppercase mt-1">PocketHost Grid Configuration</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-dim transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-10 space-y-8">
                {!editingInstance && (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-accent-green uppercase tracking-widest ml-1 flex items-center gap-2">
                       Inventory Selection
                       <span className="bg-accent-green/10 px-2 py-0.5 rounded text-[8px]">{unassignedInstances.length} Available</span>
                    </label>
                    <select 
                      required
                      value={formData.selected_stock_id}
                      onChange={e => {
                        const id = e.target.value;
                        const stock = unassignedInstances.find(i => i.id === Number(id));
                        setFormData({
                          ...formData, 
                          selected_stock_id: id,
                          instance_name: stock?.instance_name || ''
                        });
                      }}
                      className="w-full bg-white/[0.04] border border-accent-green/30 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green transition-all uppercase"
                    >
                      <option value="" disabled className="bg-bg-deep">--- Choose from Stock ---</option>
                      {unassignedInstances.map(i => (
                        <option key={i.id} value={i.id} className="bg-bg-deep">
                          Stock Unit: {i.instance_name}
                        </option>
                      ))}
                      <option value="new" className="bg-bg-deep text-text-dim">--- New Manual Entry ---</option>
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Instance Identifier (Subdomain)</label>
                  <div className="relative group">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
                    <input 
                      required
                      type="text"
                      placeholder="rafiki-client-infra"
                      value={formData.instance_name}
                      onChange={e => setFormData({...formData, instance_name: e.target.value})}
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-28 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-bold text-text-dim/40 tracking-widest uppercase italic">.pockethost.io</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Fee Amount (KSh)</label>
                    <input 
                      required
                      type="number"
                      value={formData.monthly_fee}
                      onChange={e => setFormData({...formData, monthly_fee: e.target.value})}
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Billing Frequency</label>
                    <select 
                      value={formData.billing_cycle}
                      onChange={e => setFormData({...formData, billing_cycle: e.target.value as any})}
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase appearance-none"
                    >
                      <option value="monthly" className="bg-bg-deep uppercase text-xs font-bold">Monthly</option>
                      <option value="quarterly" className="bg-bg-deep uppercase text-xs font-bold">Quarterly</option>
                      <option value="semi-annual" className="bg-bg-deep uppercase text-xs font-bold">Semi-Annual</option>
                      <option value="yearly" className="bg-bg-deep uppercase text-xs font-bold">Yearly</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Lifecycle Status</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase appearance-none"
                    >
                      <option value="active" className="bg-bg-deep uppercase text-xs font-bold">Active System</option>
                      <option value="trial" className="bg-bg-deep uppercase text-xs font-bold">Trial Node</option>
                      <option value="suspended" className="bg-bg-deep uppercase text-xs font-bold">Suspended</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Client Association</label>
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
                    <input 
                      type="text"
                      placeholder="Search for client..."
                      value={clientSearch}
                      onFocus={() => setShowClientDropdown(true)}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                      }}
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                    />
                  </div>

                  <AnimatePresence>
                    {showClientDropdown && filteredClients && filteredClients.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 left-0 right-0 top-full mt-2 glass-panel !bg-bg-deep border border-text-main/10 rounded-2xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto"
                      >
                        {filteredClients.map(client => (
                          <button
                            key={client.node_id}
                            type="button"
                            onClick={() => {
                              setFormData({...formData, client_id: client.node_id});
                              setClientSearch(client.name);
                              setShowClientDropdown(false);
                            }}
                            className="w-full px-5 py-4 text-left hover:bg-accent-green/10 flex items-center justify-between group transition-all"
                          >
                            <div>
                              <p className="text-[10px] font-black text-text-main uppercase group-hover:text-accent-green transition-colors">{client.name}</p>
                              <p className="text-[8px] text-text-dim uppercase font-bold tracking-widest">{client.node_id}</p>
                            </div>
                            <ShieldCheck className="w-4 h-4 text-text-dim opacity-0 group-hover:opacity-100 transition-all text-accent-green" />
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {formData.client_id && (
                    <div className="flex items-center justify-between mt-2">
                       <p className="text-[8px] font-black text-accent-green uppercase tracking-widest ml-1 animate-pulse flex items-center gap-1.5">
                        <ShieldCheck className="w-3 h-3" />
                        Client Synchronized: {formData.client_id}
                      </p>
                      <button 
                        type="button"
                        onClick={() => {
                          setFormData({...formData, client_id: ''});
                          setClientSearch('');
                        }}
                        className="text-[8px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-8 py-4 rounded-2xl border border-white/10 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-8 py-4 rounded-2xl text-bg-deep bg-accent-green text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-neon"
                  >
                    {editingInstance ? 'Apply Changes' : 'Save Instance'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deletingInstance && (
          <ConfirmationModal 
            onConfirm={confirmDelete}
            onCancel={() => setDeletingInstance(null)}
            title="Decommission Node"
            message={`Are you sure you want to permanently decommission the PocketHost instance "${deletingInstance.instance_name}"? This action will sever all client connections to this node.`}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConfirmationModal({ onConfirm, onCancel, title, message }: { onConfirm: () => void, onCancel: () => void, title: string, message: string }) {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-bg-deep/95 backdrop-blur-xl"
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-md bg-bg-deep/50 border border-red-500/30 rounded-[3rem] p-12 text-center shadow-[0_0_100px_rgba(239,68,68,0.2)] overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
        
        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8 relative">
          <div className="absolute inset-0 bg-red-500/20 blur-2xl animate-pulse rounded-full" />
          <AlertTriangle className="w-10 h-10 text-red-500 relative z-10" />
        </div>

        <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter mb-4">{title}</h2>
        <p className="text-[11px] text-text-dim font-bold leading-relaxed uppercase tracking-[0.2em] mb-10 opacity-60">
          {message}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <button 
            type="button"
            onClick={onConfirm}
            className="w-full py-5 rounded-2xl bg-red-500 text-bg-deep text-[11px] font-black uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:scale-[1.02] active:scale-95 transition-all"
          >
            Confirm & Decommission
          </button>
          <button 
            type="button"
            onClick={onCancel}
            className="w-full py-5 rounded-2xl border border-white/10 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95"
          >
            Abort Protocol
          </button>
        </div>
      </motion.div>
    </div>
  );
}
