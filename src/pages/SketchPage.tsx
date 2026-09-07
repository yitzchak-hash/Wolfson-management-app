import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { useT } from '../data/strings';
import { startSketcherSync } from '../data/sketcherStore';
import { aptLabel } from '../types';

/**
 * The sketch studio over one plan (`/sketch/:fileId?name=&job=&project=&folder=`
 * — `sketchPath()` in `src/data/paths.ts` is the one way to address it). The
 * Plan Sketcher's B7–B9 studio, hosted here exactly the way the sketcher hosts
 * it; the job is the apartment, and closing goes back to where the job lives.
 * The studio itself is lazy — it carries pdf.js; the ROUTE is not (a lazy
 * route would flash its Suspense fallback under the urgent-nav shim).
 */
const SketchStudio = lazy(() => import('../components/sketch/SketchStudio').then(m => ({ default: m.SketchStudio })));

export function SketchPage() {
  const t = useT();
  const { fileId = '' } = useParams();
  const [q] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = useStore(s => s.currentUser);
  const currentProjectId = useStore(s => s.currentProjectId);
  const apartments = useStore(s => s.apartments);
  const [toast, setToast] = useState('');
  const name = q.get('name') ?? t.plan;
  const job = q.get('job') ?? undefined;
  const folder = q.get('folder') ?? undefined;
  const apt = job ? apartments.find(a => a.id === job) : undefined;
  useEffect(() => { startSketcherSync(); }, []);
  const say = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 3200); };
  const back = () => navigate(currentProjectId === 'general' ? '/jobs' : '/project');
  return (
    <div className="min-h-screen bg-gray-900" data-sketch-page>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/80 text-sm">{t.sketchLoading}</div>}>
        <SketchStudio
          key={fileId}
          planFileId={fileId}
          planName={name}
          apartmentId={job ?? `sk-${fileId}`}
          apartmentLabel={apt ? aptLabel(apt) : name}
          driveFolderUrl={folder ? `https://drive.google.com/drive/folders/${folder}` : undefined}
          authorName={currentUser?.name ?? 'Office'}
          onClose={back}
          onToast={say}
        />
      </Suspense>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg" data-toast>{toast}</div>
      )}
    </div>
  );
}
