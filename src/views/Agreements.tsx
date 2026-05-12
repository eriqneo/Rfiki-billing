import React, { useState, useRef } from 'react';
import { db, Client, Agreement } from '../db/db';
import { FileText, Plus, ShieldCheck, Clock, XCircle, Download, Link, Trash2, Search, Upload, Calendar, ChevronRight, CheckCircle2, X } from 'lucide-react';
import { useSync } from '../hooks/useSync';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useUnifiedCollection } from '../hooks/useUnifiedCollection';
import { pb } from '../lib/pocketbase';

export function Agreements() {
  const { theme } = useTheme();
  const { data: agreements } = useUnifiedCollection<Agreement>('agreements', () => db.agreements.toArray());
  const [showNewModal, setShowNewModal] = useState(false);

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-text-main uppercase tracking-tighter">Agreements</h1>
          <p className="text-xs text-accent-green font-bold tracking-[0.2em] uppercase mt-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">Client Contracts & Documentation</p>
        </div>
        <button 
          onClick={() => setShowNewModal(true)}
          className="text-[10px] font-black text-bg-deep uppercase tracking-[0.2em] bg-accent-green px-6 py-2.5 rounded-xl neon-glow transition-all active:scale-95"
        >
          Create Agreement
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agreements?.map((a) => (
          <div key={a.id} className="glass-panel backdrop-blur-[30px] p-8 rounded-[2.5rem] group cursor-pointer relative overflow-hidden flex flex-col h-[320px] transition-all duration-500 border-white/5 hover:border-white/20 hover:shadow-[0_0_40px_rgba(57,255,20,0.15)]">
            {/* Status Badge */}
            <div className="absolute top-6 right-6 z-10">
              <div className={cn(
                "px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border backdrop-blur-md transition-all",
                a.status === 'active' && "border-accent-green/30 bg-accent-green/10 text-accent-green shadow-[0_0_15px_rgba(57,255,20,0.3)]",
                a.status === 'pending' && "border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]",
                a.status === 'expired' && "border-red-500/30 bg-red-500/10 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              )}>
                {a.status === 'pending' ? 'Draft' : a.status}
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className="w-12 h-12 glass-panel !bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-accent-green group-hover:text-bg-deep transition-all duration-300">
                <FileText className="w-6 h-6" />
              </div>
              
              <div className="space-y-1">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter group-hover:text-accent-green transition-colors">{a.client_name}</h3>
                <p className="text-xs font-bold text-text-dim uppercase tracking-widest truncate" title={a.project_details}>{a.project_details}</p>
              </div>

              <div className="pt-4 space-y-1 opacity-60">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-text-dim">
                  <span className="w-1 h-1 rounded-full bg-text-dim/40" />
                  Created: {a.created_date || 'N/A'}
                </div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-text-dim">
                  <span className={cn("w-1 h-1 rounded-full", a.status === 'active' ? "bg-accent-green" : "bg-text-dim/40")} />
                  Signed: {a.signed_date || 'Pending'}
                </div>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
              <div className="flex items-center gap-3">
                <button className="p-2 rounded-lg bg-white/5 hover:bg-accent-green/20 text-text-dim hover:text-accent-green transition-all" title="Download PDF">
                  <Download className="w-4 h-4" />
                </button>
                <button className="p-2 rounded-lg bg-white/5 hover:bg-accent-green/20 text-text-dim hover:text-accent-green transition-all" title="Share Link">
                  <Link className="w-4 h-4" />
                </button>
              </div>
              <button className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-text-dim hover:text-red-500 transition-all" title="Delete" onClick={() => a.id && db.agreements.delete(a.id)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Background Glow */}
            <div className={cn(
              "absolute -bottom-10 -right-10 w-32 h-32 blur-[60px] transition-all duration-700 opacity-20 group-hover:opacity-40",
              a.status === 'active' ? "bg-accent-green" : a.status === 'pending' ? "bg-amber-500" : "bg-red-500"
            )} />
          </div>
        ))}

        {agreements?.length === 0 && (
          <div className="md:col-span-2 lg:col-span-2 glass-panel !bg-white/[0.02] border-dashed border-white/10 rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center h-[320px]">
             <div className="w-20 h-20 bg-accent-green/5 rounded-full flex items-center justify-center mb-6 border border-accent-green/20">
                <FileText className="w-10 h-10 text-accent-green opacity-50" />
             </div>
             <h3 className="text-xl font-black text-text-main uppercase tracking-widest mb-2">No Agreements Yet</h3>
             <p className="text-xs text-text-dim/60 mb-8 max-w-sm mx-auto leading-relaxed">You haven't uploaded any client contracts or documentation. Start by creating a new agreement.</p>
          </div>
        )}

        <button 
          onClick={() => setShowNewModal(true)}
          className="glass-panel !bg-white/[0.02] border-dashed border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center h-[320px] transition-all hover:border-accent-green/40 group w-full"
        >
          <div className="w-16 h-16 glass-panel !bg-white/5 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
            <Plus className="w-8 h-8 text-text-dim group-hover:text-accent-green transition-colors" />
          </div>
          <p className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em] mb-2">Create Agreement</p>
          <span className="text-[11px] font-black text-accent-green uppercase tracking-widest hover:brightness-125 transition-all">Upload File</span>
        </button>
      </div>

      <AnimatePresence>
        {showNewModal && (
          <NewAgreementModal onClose={() => setShowNewModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function NewAgreementModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [projectDetails, setProjectDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reviewDate, setReviewDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: clients } = useUnifiedCollection<Client>('clients', () =>
    db.clients.filter(c =>
      (c.name || '').toLowerCase().includes((search || '').toLowerCase()) ||
      (c.email || '').toLowerCase().includes((search || '').toLowerCase())
    ).toArray()
  );

  const { data: allPayments } = useUnifiedCollection<any>('payments', () => db.payments.where('status').equals('completed').toArray());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSave = async () => {
    if (!selectedClient || !file) return;

    setIsSaving(true);
    try {
      const newAgreement: Agreement = {
        client_id: selectedClient.node_id,
        client_name: selectedClient.name,
        project_details: projectDetails || 'New Service Agreement',
        file_path: URL.createObjectURL(file),
        file_blob: file,
        signed_date: '',
        created_date: new Date().toISOString().split('T')[0],
        expiry_date: reviewDate,
        status: 'pending',
        synced: false
      };

      if (import.meta.env.VITE_AUTH_MODE === 'pocketbase') {
        try {
          const pbPayload = {
            client_id: newAgreement.client_id,
            client_name: newAgreement.client_name,
            project_details: newAgreement.project_details,
            created_date: newAgreement.created_date,
            expiry_date: newAgreement.expiry_date,
            status: newAgreement.status,
          };
          await pb.collection('agreements').create(pbPayload);
        } catch (e) {
          console.warn('PB agreements write failed, saved locally:', e);
        }
      }
      await db.agreements.add(newAgreement);
      showToast('Agreement saved successfully', 'success');
      onClose();
    } catch (error) {
      console.error('Failed to save agreement:', error);
      showToast('Failed to save agreement', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-bg-deep/80 backdrop-blur-xl"
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-2xl glass-panel !bg-bg-deep/90 backdrop-blur-[40px] border-white/10 rounded-[3rem] overflow-hidden shadow-2xl shadow-black/30"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter">Create Agreement</h2>
            <p className="text-[10px] font-black text-accent-green uppercase tracking-[0.3em] mt-1">Agreement Documentation</p>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full glass-panel !bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/5 flex">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={cn(
                "flex-1 transition-all duration-500",
                step >= s ? "bg-accent-green" : "bg-transparent"
              )} 
            />
          ))}
        </div>

        <div className="p-10 min-h-[400px]">
          {/* Step 1: Client Selection */}
          {step === 1 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em]">Step 1 of 3: Choose a Client</label>
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-text-dim/40" />
                  <input 
                    type="text"
                    placeholder="SEARCH ENTITY NAME OR EMAIL..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-text-main/[0.03] border border-text-main/10 rounded-[2rem] py-5 px-16 text-xs font-black text-text-main uppercase tracking-widest focus:outline-none focus:border-accent-green/30 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {clients?.map((client) => {
                  const hasPaid = allPayments?.some(p => p.client_id === client.node_id);
                  return (
                    <button
                      key={client.id}
                      disabled={!hasPaid}
                      onClick={() => {
                        setSelectedClient(client);
                        setStep(2);
                      }}
                      className={cn(
                        "p-5 rounded-2xl glass-panel text-left flex items-center justify-between transition-all group",
                        selectedClient?.id === client.id ? "border-accent-green/40 bg-accent-green/5" : "hover:border-white/20 active:scale-[0.98]",
                        !hasPaid && "opacity-40 grayscale cursor-not-allowed border-amber-500/20"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={cn("text-xs font-black uppercase tracking-widest", selectedClient?.id === client.id ? "text-accent-green" : "text-text-main")}>{client.name}</h4>
                          {!hasPaid && <span className="text-[7px] font-black italic text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded uppercase">Awaiting Payment</span>}
                        </div>
                        <p className="text-[9px] font-bold text-text-dim/60 uppercase mt-1">{client.email}</p>
                      </div>
                      {selectedClient?.id === client.id ? (
                        <CheckCircle2 className="w-5 h-5 text-accent-green" />
                      ) : hasPaid ? (
                        <ChevronRight className="w-4 h-4 text-text-dim group-hover:text-accent-green transition-colors" />
                      ) : (
                        <XCircle className="w-4 h-4 text-amber-500/50" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Upload */}
          {step === 2 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em]">Step 2 of 3: Upload Documentation</label>
                <div className="space-y-4">
                  <label className="text-[9px] font-black text-text-dim/40 uppercase tracking-widest">Agreement Classification</label>
                  <input 
                    type="text"
                    placeholder="e.g. Web Dev Contract / Retainer Update"
                    value={projectDetails}
                    onChange={(e) => setProjectDetails(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] py-4 px-6 text-xs font-black text-text-main uppercase tracking-widest focus:outline-none focus:border-accent-green/30 transition-all"
                  />
                </div>
              </div>

              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-[3rem] p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer group",
                  file ? "border-accent-green/40 bg-accent-green/5" : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
                )}
              >
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
                
                {file ? (
                  <div className="space-y-4 flex flex-col items-center">
                    <div className="w-20 h-20 glass-panel !bg-accent-green/10 rounded-[2rem] flex items-center justify-center text-accent-green animate-bounce-slow">
                      <FileText className="w-10 h-10 shadow-neon" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-text-main uppercase tracking-widest">{file.name}</h4>
                      <p className="text-[9px] font-bold text-accent-green uppercase mt-1">Ready to upload</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 flex flex-col items-center">
                    <div className="w-20 h-20 glass-panel !bg-white/5 rounded-[2rem] flex items-center justify-center text-text-dim group-hover:text-accent-green transition-all duration-500">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-text-main uppercase tracking-widest">Drop PDF Documentation</h4>
                      <p className="text-[9px] font-bold text-text-dim/40 uppercase mt-1">Or click to browse storage</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Calendar */}
          {step === 3 && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <label className="text-[10px] font-black text-text-dim uppercase tracking-[0.3em]">Step 3 of 3: Set Expiry Date</label>
                <p className="text-xs text-text-dim/60 font-medium">Define the lifecycle boundary for this agreement. This will be synchronized with your Business Calendar.</p>
              </div>

              <div className="space-y-6">
                <div className="glass-panel p-8 rounded-[2rem] space-y-4 border-white/10">
                  <div className="flex items-center gap-4 text-accent-green">
                    <Calendar className="w-6 h-6" />
                    <span className="text-xs font-black uppercase tracking-widest">Expiry / Review Deadline</span>
                  </div>
                  <input 
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className={cn(
                      "w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-8 text-xs font-black text-text-main uppercase tracking-widest focus:outline-none focus:border-accent-green/30 transition-all block",
                      theme === 'dark' ? "[color-scheme:dark]" : "[color-scheme:light]"
                    )}
                  />
                </div>

                <div className="glass-panel !bg-accent-green/5 border-accent-green/10 p-6 rounded-[2rem] flex items-start gap-4">
                  <ShieldCheck className="w-5 h-5 text-accent-green flex-shrink-0 mt-1" />
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-text-main uppercase tracking-widest">Integrity Verification</h5>
                    <p className="text-[9px] font-medium text-text-dim leading-relaxed">By finalizing, you confirm this document is legally binding and formatted according to standards. Data will be saved locally until cloud sync is initiated.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-8 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
          <button 
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-[10px] font-black text-text-dim hover:text-text-main uppercase tracking-[0.2em] transition-all"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={cn("w-1.5 h-1.5 rounded-full transition-all", step === s ? "bg-accent-green" : "bg-white/10")} />
              ))}
            </div>
            <button 
              onClick={() => {
                if (step < 3) setStep(step + 1);
                else handleSave();
              }}
              disabled={isSaving || (step === 1 && !selectedClient) || (step === 2 && (!file || !projectDetails))}
              className={cn(
                "px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2",
                isSaving ? "bg-white/5 text-text-dim" : "bg-accent-green text-bg-deep neon-glow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSaving ? 'Saving...' : step === 3 ? 'Save Agreement' : 'Continue'}
              {step < 3 && !isSaving && <ChevronRight className="w-4 h-4" />}
              {step === 3 && !isSaving && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
