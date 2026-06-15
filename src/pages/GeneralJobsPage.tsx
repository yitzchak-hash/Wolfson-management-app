import React, { useState } from 'react';
import { Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList } from 'lucide-react';
import { useStore } from '../data/store';
import { Apartment } from '../types';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { Toast } from '../components/ui/Toast';

export function GeneralJobsPage() {
  const {
    apartments,
    addApartment,
    deleteApartment,
    stages: allStages,
    contractorAssignments,
    currentUser,
    mainUiStrings: s,
  } = useStore();

  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const jobs = apartments.filter(a => !a.isUnnamed);

  function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!jobName.trim()) return;
    const now = new Date().toISOString();
    const id = `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addApartment({
      id,
      buildingId: 'G',
      apartmentNumber: id,
      displayName: jobName.trim(),
      floor: 0,
      colPosition: 1,
      colSpan: 1,
      isDuplexApt: false,
      currentStageId: null,
      classification: 'standard',
      shinuiDetails: null,
      generalNotes: '',
      isUnnamed: false,
      address: jobAddress.trim() || undefined,
      zohoLink: jobZoho.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.id ?? '',
      updatedByName: currentUser?.name ?? '',
    });
    setJobName('');
    setJobAddress('');
    setJobZoho('');
    setShowAddModal(false);
    setToast(s.taskAdded);
  }

  function handleDelete(id: string) {
    if (!window.confirm(s.deleteJobConfirm)) return;
    if (selectedJob?.id === id) setSelectedJob(null);
    deleteApartment(id);
  }

  const stages = allStages.filter(st => st.projectId === 'general');
  const stageMap = new Map(stages.map(st => [st.id, st]));

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Briefcase size={22} className="text-[#1e3a5f]" />
            <h1 className="text-xl font-bold text-gray-900">{s.generalJobsTitle}</h1>
            {jobs.length > 0 && (
              <span className="text-xs font-medium bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{jobs.length}</span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
          >
            <Plus size={16} /> {s.addJobBtn}
          </button>
        </div>

        {/* Empty state */}
        {jobs.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Briefcase size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{s.noJobsYet}</p>
          </div>
        )}

        {/* Job grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map(job => {
            const stage = job.currentStageId ? stageMap.get(job.currentStageId) : null;
            const pendingTasks = contractorAssignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;
            return (
              <div
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-[#4aa8d8]/40 transition-all group relative"
              >
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(job.id); }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>

                {/* Stage dot + name */}
                <div className="flex items-start gap-2 mb-2 pr-7">
                  {stage && (
                    <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ backgroundColor: stage.color }} />
                  )}
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{job.displayName}</h3>
                </div>

                {/* Stage badge */}
                {stage && (
                  <div className="mb-2">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: stage.color }}>
                      {stage.name}
                    </span>
                  </div>
                )}

                {/* Address */}
                {job.address && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
                    <MapPin size={11} className="flex-shrink-0 text-gray-400" />
                    <span className="truncate">{job.address}</span>
                  </div>
                )}

                {/* Zoho link */}
                {job.zohoLink && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <a
                      href={job.zohoLink.startsWith('http') ? job.zohoLink : `https://${job.zohoLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] text-[#4aa8d8] hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> {s.zohoLinkLabel}
                    </a>
                  </div>
                )}

                {/* Task count */}
                {pendingTasks > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-amber-600 font-medium mt-1">
                    <ClipboardList size={11} />
                    {pendingTasks} {s.pendingTasks}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Job modal */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(420px, 92vw)' }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{s.addJobBtn}</h2>
            <form onSubmit={handleAddJob} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.jobNameLabel} *</label>
                <input
                  autoFocus
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder={s.jobNameLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.addressLabel}</label>
                <input
                  value={jobAddress}
                  onChange={e => setJobAddress(e.target.value)}
                  placeholder={s.addressLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.zohoLinkLabel}</label>
                <input
                  value={jobZoho}
                  onChange={e => setJobZoho(e.target.value)}
                  placeholder="https://crm.zoho.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">
                  {s.cancel}
                </button>
                <button type="submit" disabled={!jobName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                  {s.addJobBtn}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Apartment Detail Drawer — reused for jobs */}
      {selectedJob && currentUser && (
        <ApartmentDetailDrawer
          apartment={selectedJob}
          onClose={() => setSelectedJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
