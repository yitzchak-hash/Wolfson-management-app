import { useCallback, useRef, useState } from 'react';

/**
 * Whether a task's MESSAGES are showing — one rule for the office's drawer
 * and the worker's phone, so the two cannot drift.
 *
 * A thread is open until somebody folds one away, and the last choice
 * becomes the default for every other task on this machine (owner,
 * 2026-09-17: "I want the task messages to be collapsible"). Per machine and
 * never synced: how much of a conversation you want on screen is about the
 * screen you are at, not the office's data — so it stays out of the store,
 * the export and Firestore.
 */
const KEY = 'thread_open_default';

function storedDefault(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function useThreadFold() {
  const [fallback, setFallback] = useState(storedDefault);
  const [own, setOwn] = useState<Record<string, boolean>>({});
  // Read through refs: the toggle works out the NEXT value before writing,
  // so neither setState updater has to do anything but return a value.
  const ownRef = useRef(own); ownRef.current = own;
  const fbRef = useRef(fallback); fbRef.current = fallback;

  const isOpen = useCallback(
    (taskId: string) => own[taskId] ?? fallback,
    [own, fallback],
  );

  const toggle = useCallback((taskId: string) => {
    const next = !(ownRef.current[taskId] ?? fbRef.current);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private window */ }
    setFallback(next);
    setOwn(prev => ({ ...prev, [taskId]: next }));
  }, []);

  return { isOpen, toggle };
}
