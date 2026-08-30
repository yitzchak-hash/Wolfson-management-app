/**
 * React, with `startTransition` running its callback INLINE — served ONLY to
 * react-router's own imports of 'react' (see the `router-urgent-nav` plugin
 * in vite.config.ts). Nothing else in the app sees this module.
 *
 * WHY THIS EXISTS — the dead buttons. react-router v7 wraps every navigation
 * state update in React.startTransition, with no opt-out (v6 did not). A
 * transition render is restarted from scratch by ANY urgent update — and this
 * app ticks: countdown widgets at 1s, wall clocks, photo walls, live presence
 * cursors. On a machine where rendering the Job Board takes longer than the
 * gap between ticks, the router's transition render never gets to finish: the
 * URL moves (history is written synchronously at navigate()) and the screen
 * never swaps. That is, word for word, the office's "the sidebar buttons
 * don't work, only refresh works" on the PC, and the TV bar's dead buttons —
 * on the TV every dead button went through setSearchParams (a router
 * transition) while the two that kept working (full screen, the overdue
 * pill) are plain component state.
 *
 * Running the callback inline makes navigation an ordinary urgent update
 * again — exactly v6's behaviour, which this app shipped on for months
 * without a single dead-button report. No route here is lazy and none has a
 * loader, so there is nothing for a transition to keep interactive during.
 *
 * The re-exports are EXPLICIT, one per React export, not `export * from
 * 'react'`: in dev Vite serves react as a CJS facade whose only ESM export
 * is `default`, so a star re-export delivers nothing and react-router dies
 * on `React.createContext is not a function`. The default/namespace pick
 * below handles both worlds (dev facade and the built bundle's interop).
 */
import ReactDefault from 'react';
import * as ReactStar from 'react';

// Whichever binding actually holds React: the dev facade's default, or the
// real namespace in the production build.
const R = (ReactDefault && ReactDefault.createContext) ? ReactDefault : ReactStar;

export default R;

/** The whole point: navigation runs as an ordinary urgent update. */
export const startTransition = (cb) => { cb(); };

export const Activity = R.Activity;
export const Children = R.Children;
export const Component = R.Component;
export const Fragment = R.Fragment;
export const Profiler = R.Profiler;
export const PureComponent = R.PureComponent;
export const StrictMode = R.StrictMode;
export const Suspense = R.Suspense;
export const __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = R.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
export const __COMPILER_RUNTIME = R.__COMPILER_RUNTIME;
export const act = R.act;
export const cache = R.cache;
export const cacheSignal = R.cacheSignal;
export const captureOwnerStack = R.captureOwnerStack;
export const cloneElement = R.cloneElement;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const createRef = R.createRef;
export const forwardRef = R.forwardRef;
export const isValidElement = R.isValidElement;
export const lazy = R.lazy;
export const memo = R.memo;
export const unstable_useCacheRefresh = R.unstable_useCacheRefresh;
export const use = R.use;
export const useActionState = R.useActionState;
export const useCallback = R.useCallback;
export const useContext = R.useContext;
export const useDebugValue = R.useDebugValue;
export const useDeferredValue = R.useDeferredValue;
export const useEffect = R.useEffect;
export const useEffectEvent = R.useEffectEvent;
export const useId = R.useId;
export const useImperativeHandle = R.useImperativeHandle;
export const useInsertionEffect = R.useInsertionEffect;
export const useLayoutEffect = R.useLayoutEffect;
export const useMemo = R.useMemo;
export const useOptimistic = R.useOptimistic;
export const useReducer = R.useReducer;
export const useRef = R.useRef;
export const useState = R.useState;
export const useSyncExternalStore = R.useSyncExternalStore;
export const useTransition = R.useTransition;
export const version = R.version;
