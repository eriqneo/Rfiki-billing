import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Client } from '../db/db';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { pb } from '../lib/pocketbase';
import { 
  Search, 
  Filter, 
  Plus, 
  Users,
  CheckCircle2,
  Clock,
  Download,
  Building2,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  DollarSign,
  FileCode,
  Zap,
  ShieldCheck,
  Smartphone,
  Server,
  Edit,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../contexts/ThemeContext';

import { NexusTable } from '../components/NexusTable';

interface ClientAccountRowProps {
  client: Client;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}

const ClientAccountRow: React.FC<ClientAccountRowProps> = ({ client, onEdit, onDelete }) => {
  const agreementCount = useLiveQuery(() => 
    db.agreements.where('client_id').equals(client.node_id).count()
  , [client.node_id]);

  const clientPayments = useLiveQuery(() => 
    db.payments.where('client_id').equals(client.node_id).toArray()
  , [client.node_id]);

  const instanceCount = useLiveQuery(() => 
    db.pocket_host_instances.where('client_id').equals(client.node_id).count()
  , [client.node_id]);

  const totalPaid = clientPayments?.reduce((sum, p) => sum + (p.status === 'completed' ? p.amount : 0), 0) || 0;
  const balance = client.agreed_price - totalPaid;

  return (
    <tr className="group hover:bg-white/[0.02] transition-colors cursor-pointer text-text-main">
      <td className="px-6 py-5">
        <span className="text-[10px] font-mono font-bold text-accent-green tracking-tighter tabular-nums opacity-80 decoration-accent-green/30 decoration-dashed underline-offset-4 underline">
          {client.node_id}
        </span>
      </td>
      <td className="px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-accent-green/30 transition-colors">
            {client.entity_type === 'COMPANY' ? <Building2 className="w-4 h-4 text-text-dim group-hover:text-accent-green transition-colors" /> : <UserIcon className="w-4 h-4 text-text-dim group-hover:text-accent-green transition-colors" />}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black text-text-main uppercase tracking-tight leading-tight">{client.name}</span>
            <span className="text-[8px] text-text-dim uppercase font-bold tracking-widest">{client.email}</span>
          </div>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[8px] font-black text-text-dim uppercase tracking-widest group-hover:text-accent-green group-hover:border-accent-green/20 transition-all w-fit">
            {client.project_tag}
          </span>
          <span className="text-[9px] font-bold text-text-dim italic truncate max-w-[150px]">
            {client.app_built || 'No application defined'}
          </span>
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex justify-center">
          <FileCode 
            title={(agreementCount || 0) > 0 ? `${agreementCount} Agreements Signed` : "No Agreements"}
            className={cn("w-4 h-4 transition-all", (agreementCount || 0) > 0 ? "text-accent-green drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]" : "text-text-dim opacity-30")} 
          />
        </div>
      </td>
      <td className="px-6 py-5">
        <div className="flex justify-center flex-col items-center gap-1">
          <Calendar 
            title={client.initial_meeting ? `Kick-off: ${client.initial_meeting}` : "No Meeting Scheduled"}
            className={cn("w-4 h-4 transition-all", client.initial_meeting ? "text-accent-green opacity-100" : "text-text-dim opacity-30")} 
          />
        </div>
      </td>
      <td className="px-6 py-5 text-right">
        <span className="text-[11px] font-black text-text-main tracking-tighter tabular-nums">
          KSh {client.agreed_price?.toLocaleString() || '0'}
        </span>
      </td>
      <td className="px-6 py-5">
        <div className="flex items-center justify-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(client); }}
            className="p-2 rounded-lg bg-white/5 border border-white/5 text-text-dim hover:text-accent-green hover:border-accent-green/20 transition-all"
            title="Edit Client"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(client); }}
            className="p-2 rounded-lg bg-red-500/5 border border-red-500/10 text-red-500/40 hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition-all"
            title="Delete Client"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export function ClientHub() {
  const { theme } = useTheme();
  const { data: clients, isLoading } = useUnifiedCollection<Client>('clients', () => db.clients.toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'INDIVIDUAL' | 'COMPANY'>('ALL');
  const { showToast } = useToast();
  const { isOnline } = useSync();

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleDeleteRequest = (client: Client) => {
    setDeletingClient(client);
  };

  const confirmDelete = async () => {
    if (!deletingClient) return;
    try {
      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase' && isOnline) {
        if (deletingClient.pb_id) {
          await pb.collection('clients').delete(deletingClient.pb_id);
        }
      }
      await db.clients.delete(deletingClient.id!);
      showToast('Client successfully expunged from records', 'success');
    } catch (e) {
      showToast('Error during data expungement', 'error');
    } finally {
      setDeletingClient(null);
    }
  };

  const headers = [
    { label: 'Account ID', className: 'text-left' },
    { label: 'Client Profile', className: 'text-left' },
    { label: 'Project Focus', className: 'text-left' },
    { label: 'Agreement', className: 'text-center' },
    { label: 'Next Meeting', className: 'text-center' },
    { label: 'Project Budget', className: 'text-right' },
    { label: 'Actions', className: 'text-center' },
  ];

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-5xl font-black text-text-main uppercase tracking-tighter leading-none">Client Hub</h1>
          <p className="text-[10px] text-accent-green font-bold tracking-[0.4em] uppercase mt-3 drop-shadow-[0_0_10px_rgba(57,255,20,0.6)]">Client Relationship Directory</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 flex-1 max-w-2xl">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-green transition-colors" />
            <input 
              type="text"
              placeholder="SEARCH NAME, TAG OR EMAIL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xs focus:outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/50 transition-all uppercase tracking-widest font-bold placeholder:text-text-dim/30"
            />
          </div>
          <button className="p-4 glass-panel rounded-2xl text-text-dim hover:text-accent-green transition-all border-white/5 bg-white/[0.02]">
            <Filter className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setEditingClient(null); setIsModalOpen(true); }}
            className="flex items-center gap-3 px-8 py-4 bg-accent-green text-bg-deep rounded-2xl font-black uppercase text-[11px] tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] active:scale-95 group"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
            New Client
          </button>
        </div>
      </header>

      <NexusTable
        data={(clients || []).filter(c => 
          (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
          (c.node_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.project_tag || '').toLowerCase().includes(searchTerm.toLowerCase())
        )}
        headers={headers}
        pageSize={4}
        renderRow={(client: any) => (
          <ClientAccountRow 
            key={client.id || client.node_id} 
            client={client} 
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
          />
        )}
      />

      <AnimatePresence>
        {isModalOpen && (
          <ClientProfileModal 
            onClose={() => { setIsModalOpen(false); setEditingClient(null); }} 
            editingClient={editingClient}
          />
        )}
        {deletingClient && (
          <ConfirmationModal
            title="Confirm Expungement"
            message={`Are you absolutely sure you want to permanently delete ${deletingClient.name}? This action cannot be reversed within the Rafiki Matrix.`}
            onConfirm={confirmDelete}
            onCancel={() => setDeletingClient(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConfirmationModal({ title, message, onConfirm, onCancel }: { title: string, message: string, onConfirm: () => void, onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="absolute inset-0 bg-bg-deep/80 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-md glass-panel border border-white/10 rounded-[2.5rem] p-10 overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50" />
        <div className="flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-text-main uppercase tracking-tight">{title}</h2>
            <p className="text-[10px] text-text-dim uppercase font-bold tracking-widest mt-2">{message}</p>
          </div>
          <div className="flex gap-4 w-full pt-4">
            <button 
              onClick={onCancel}
              className="flex-1 py-4 rounded-2xl border border-white/5 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              Abort
            </button>
            <button 
              onClick={onConfirm}
              className="flex-1 py-4 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)]"
            >
              Confirm
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface ClientProfileModalProps {
  onClose: () => void;
  editingClient?: Client | null;
}

function ClientProfileModal({ onClose, editingClient }: ClientProfileModalProps) {
  const { theme } = useTheme();
  const { addEntity, updateEntity, isOnline } = useSync();
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<any>(editingClient ? { ...editingClient } : {
    node_id: '',
    name: '',
    entity_type: 'COMPANY',
    email: '',
    phone: '',
    agreed_price: 0,
    deposit_paid: false,
    initial_meeting: '',
    target_payment: '',
    project_tag: 'CORE SYSTEM',
    app_built: '',
    project_desc: '',
    notes: '',
    contact_json: '{}'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const newNodeId = editingClient?.node_id || `CL-${(Math.floor(Math.random() * 9000) + 1000).toString()}`;
      const clientData = {
        node_id: newNodeId,
        name: formData.name,
        entity_type: formData.entity_type,
        email: formData.email,
        phone: formData.phone || '+254',
        agreed_price: parseFloat(formData.agreed_price) || 0,
        deposit_paid: formData.deposit_paid,
        initial_meeting: formData.initial_meeting || new Date().toISOString(),
        target_payment: formData.target_payment || new Date().toISOString(),
        project_tag: formData.project_tag || 'Standard Agreement',
        app_built: formData.app_built,
        project_desc: formData.project_desc,
        contact_json: JSON.stringify({ email: formData.email, phone: formData.phone }),
        notes: formData.notes,
        synced: false
      };

      if (editingClient) {
        if (editingClient.id && typeof editingClient.id === 'number') {
          await updateEntity('clients', editingClient.id, clientData);
        } else if (editingClient.pb_id && isOnline) {
          await pb.collection('clients').update(editingClient.pb_id, clientData);
        }
        showToast('Client profile updated successfully', 'success');
      } else {
        await addEntity('clients', clientData);
        
        showToast('New client profile established', 'success');
      }
      onClose();
    } catch (error) {
      console.error('Failed to save client account:', error);
      showToast('Data persistence failure', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl"
      />
      <motion.div 
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-5xl bg-bg-deep/50 border border-white/10 rounded-[3rem] p-12 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-green to-transparent opacity-50" />
        
        <header className="flex justify-between items-start mb-12">
          <div>
            <h2 className="text-3xl font-black text-text-main uppercase tracking-tight">
              {editingClient ? 'Edit Profile' : 'Client Profile'}
            </h2>
            <p className="text-[10px] text-accent-green font-bold tracking-[0.4em] uppercase mt-2">Matrix Entry Identification</p>
          </div>
          <button onClick={onClose} className="p-3 glass-panel rounded-2xl text-text-dim hover:text-accent-green transition-all">
            <X className="w-6 h-6" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Full Name or Company</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="ACME GLOBAL SYSTEMS..."
                  className="w-full bg-text-main/[0.03] border border-text-main/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/50 transition-all uppercase tracking-widest"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Contact Number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-text-dim opacity-30" />
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="+254 7XX XXX XXX"
                      className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-10 pr-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 transition-all tracking-widest"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    required
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="client@email.com"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">What are we building?</label>
                <div className="relative">
                  <Zap className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-accent-green opacity-50" />
                  <input 
                    required
                    type="text" 
                    value={formData.app_built}
                    onChange={e => setFormData({...formData, app_built: e.target.value})}
                    placeholder="ERP SYSTEM, LOAN APP, ETC..."
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-10 pr-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Project Tag</label>
                <input 
                  type="text" 
                  value={formData.project_tag}
                  onChange={e => setFormData({...formData, project_tag: e.target.value})}
                  placeholder="E.G. Q3_RETAIL, FINTECH_PWA..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Entity Type</label>
                <div className="flex bg-white/[0.02] border border-white/10 rounded-2xl p-1.5 gap-1.5">
                  {(['INDIVIDUAL', 'COMPANY'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({...formData, entity_type: type})}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-[9px] font-black tracking-[0.2em] transition-all",
                        formData.entity_type === type 
                          ? "bg-accent-green text-bg-deep shadow-[0_0_15px_rgba(57,255,20,0.3)]" 
                          : "text-text-dim hover:bg-white/5"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Agreed Project Rate (KSh)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 text-accent-green opacity-50" />
                  <input 
                    required
                    type="number" 
                    value={formData.agreed_price}
                    onChange={e => setFormData({...formData, agreed_price: e.target.value})}
                    placeholder="0.00"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-10 pr-5 text-xs font-black text-accent-green placeholder:text-accent-green/10 focus:outline-none focus:border-accent-green/50 transition-all tracking-widest"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Project Description</label>
                <textarea 
                  value={formData.project_desc}
                  onChange={e => setFormData({...formData, project_desc: e.target.value})}
                  placeholder="BRIEF OVERVIEW OF THE PROJECT GOALS..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-2xl p-5 text-xs font-black text-text-main placeholder:text-text-dim/20 focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest min-h-[100px] resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-5 glass-panel rounded-2xl border-white/5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-text-main uppercase tracking-widest">Deposit Information</span>
                  <span className="text-[7px] text-text-dim uppercase font-bold tracking-widest mt-1">Mark deposit as received</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, deposit_paid: !formData.deposit_paid})}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-all border",
                    formData.deposit_paid 
                      ? "bg-accent-green/20 border-accent-green/50 shadow-[0_0_15px_rgba(57,255,20,0.2)]" 
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-all",
                    formData.deposit_paid 
                      ? "right-1 bg-accent-green shadow-neon" 
                      : "left-1 bg-text-dim"
                  )} />
                </button>
              </div>

              <div className="group border border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-3 hover:border-accent-green/30 hover:bg-accent-green/5 transition-all cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-accent-green/10 transition-colors">
                  <Download className="w-6 h-6 text-text-dim group-hover:text-accent-green" />
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black text-text-main uppercase tracking-widest">Project Agreement</p>
                  <p className="text-[7px] text-text-dim uppercase font-bold tracking-[0.2em] mt-1">Select file or drag to upload PDF</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Kick-off Meeting Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-green" />
                <input 
                  type="datetime-local" 
                  value={formData.initial_meeting}
                  onChange={e => setFormData({...formData, initial_meeting: e.target.value})}
                  className={cn(
                    "w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest",
                    theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                  )}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-widest ml-1">Target Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                <input 
                  type="date" 
                  value={formData.target_payment}
                  onChange={e => setFormData({...formData, target_payment: e.target.value})}
                  className={cn(
                    "w-full bg-white/[0.02] border border-white/10 rounded-2xl py-4 pl-12 pr-5 text-xs font-black text-text-main focus:outline-none focus:border-accent-green/50 transition-all uppercase tracking-widest",
                    theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                  )}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-10 border-t border-white/5">
            <div className="flex items-center gap-3 opacity-40">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
              <span className="text-[8px] font-black text-text-dim uppercase tracking-[.4em]">Ready to save</span>
            </div>
            
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 md:flex-none px-10 py-5 rounded-2xl border border-white/10 text-[10px] font-black text-text-dim uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className="flex-1 md:flex-none px-12 py-5 rounded-2xl bg-accent-green text-bg-deep text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] active:scale-95 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-bg-deep border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {isSaving ? 'Processing...' : (editingClient ? 'Update Profile' : 'Add Client')}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
