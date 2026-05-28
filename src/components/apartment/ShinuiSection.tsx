import React, { useState, useEffect } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { ShinuiDetail } from '../../types';

interface ShinuiSectionProps {
  shinuiDetails: ShinuiDetail | null;
  onSave: (details: ShinuiDetail) => void;
}

const emptyDetails: ShinuiDetail = {
  description: '',
  requestedBy: '',
  notes: '',
  dateOfChange: '',
};

export function ShinuiSection({ shinuiDetails, onSave }: ShinuiSectionProps) {
  const [details, setDetails] = useState<ShinuiDetail>(shinuiDetails ?? emptyDetails);

  useEffect(() => {
    setDetails(shinuiDetails ?? emptyDetails);
  }, [shinuiDetails]);

  function update(key: keyof ShinuiDetail, value: string) {
    setDetails(d => ({ ...d, [key]: value }));
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle size={16} />
        <span className="font-semibold text-sm">Shinui / Change Details</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Requested By</label>
          <input
            value={details.requestedBy}
            onChange={e => update('requestedBy', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="Name..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date of Change</label>
          <input
            type="date"
            value={details.dateOfChange}
            onChange={e => update('dateOfChange', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description of Change</label>
        <textarea
          value={details.description}
          onChange={e => update('description', e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="Describe what changed..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Important Notes</label>
        <textarea
          value={details.notes}
          onChange={e => update('notes', e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          placeholder="Any important notes..."
        />
      </div>
      <button
        onClick={() => onSave(details)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors"
      >
        <Save size={12} />
        Save Shinui Details
      </button>
    </div>
  );
}
