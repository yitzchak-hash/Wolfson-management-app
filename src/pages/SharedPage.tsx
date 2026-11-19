import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { SharedLinksSettings } from '../components/settings/SharedLinksSettings';
import { Toast } from '../components/ui/Toast';

/**
 * SHARED — its own tab on the side bar, under Settings after a dividing line (owner, 2026-11-18: "put the shared
 * button not in the settings, but on the side of the taskbar under the settings button, and have a line between").
 * Make a read-only link of this project for someone outside the office, see who opened it, turn it off.
 */
export function SharedPage() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900"><Share2 size={20} /> Shared</h1>
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <SharedLinksSettings onToast={(msg, type = 'success') => setToast({ msg, type })} />
        </div>
      </div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
