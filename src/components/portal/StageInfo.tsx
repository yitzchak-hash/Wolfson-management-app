/**
 * The little (i) at the end of a stage line on the worker's "What are you
 * doing here today?" list (owner, 2026-11-01): tap it and a window says what
 * goes in this stage — its bubbles in the worker's language — with example
 * photos from real jobs in a grid. It never picks the stage; only the line
 * itself does.
 *
 * The photos are `Stage.examples` (Drive file ids), kept on the stage in the
 * cloud like everything else.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { Stage, PortalLang, stageNameIn } from '../../types';
import { includeIn } from '../../data/stageIncludes';
import { TrText } from '../ui/Translated';
import { driveThumbUrl } from '../../data/driveApi';

const WORDS = {
  open: { en: 'What goes in this stage', he: 'מה נכנס בשלב הזה', ru: 'Что входит в этот этап' },
  inside: { en: 'What goes in here', he: 'מה נכנס כאן', ru: 'Что сюда входит' },
  examples: { en: 'Example photos', he: 'תמונות לדוגמה', ru: 'Примеры фото' },
  none: { en: 'No example photos yet.', he: 'אין עדיין תמונות לדוגמה.', ru: 'Примеров фото пока нет.' },
  close: { en: 'Close', he: 'סגור', ru: 'Закрыть' },
} as const;

export function StageInfoButton({ stage, lang }: { stage: Stage; lang: PortalLang }) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const t = (k: keyof typeof WORDS) => WORDS[k][lang] ?? WORDS[k].en;
  const items = stage.includes ?? [];
  const pics = stage.examples ?? [];
  if (!items.length && !pics.length) return null;

  return (
    <>
      <button type="button" data-stage-info={stage.id} aria-label={t('open')}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-95"
        style={{ color: stage.color, backgroundColor: `${stage.color}14` }}>
        <Info size={22} />
      </button>
      {open && createPortal(
        <div data-stage-info-window={stage.id} role="dialog" aria-modal="true"
          className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => { setOpen(false); setBig(null); }}>
          <div dir={lang === 'he' ? 'rtl' : 'ltr'} onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <h2 className="flex-1 m-0 font-extrabold text-gray-900" style={{ fontSize: 19 }}>{stageNameIn(stage, lang)}</h2>
              <button type="button" aria-label={t('close')} onClick={() => { setOpen(false); setBig(null); }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-100"><X size={22} /></button>
            </div>
            {items.length > 0 && (
              <div>
                <p className="m-0 mb-1.5 font-bold text-gray-500" style={{ fontSize: 13 }}>{t('inside')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(word => (
                    <span key={word} className="px-2.5 py-1 rounded-full font-semibold text-gray-800"
                      style={{ fontSize: 14, backgroundColor: `${stage.color}22` }}>
                      {includeIn(stage, word, lang) || <TrText text={word} to={lang} />}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="m-0 mb-1.5 font-bold text-gray-500" style={{ fontSize: 13 }}>{t('examples')}</p>
              {pics.length ? (
                big ? (
                  <button type="button" className="block w-full" onClick={() => setBig(null)}>
                    <img src={driveThumbUrl(big, 1600)} alt="" className="w-full rounded-xl bg-gray-100" style={{ maxHeight: '64vh', objectFit: 'contain' }} />
                  </button>
                ) : (
                  <div data-stage-info-grid className="grid grid-cols-2 gap-2">
                    {pics.map(id => (
                      <button key={id} type="button" onClick={() => setBig(id)} className="block rounded-xl overflow-hidden bg-gray-100">
                        <img src={driveThumbUrl(id, 600)} alt="" loading="lazy" className="w-full aspect-[3/4] object-cover" />
                      </button>
                    ))}
                  </div>
                )
              ) : <p className="m-0 text-gray-400" style={{ fontSize: 14 }}>{t('none')}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
