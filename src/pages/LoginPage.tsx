import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStore } from '../data/store';
import { personColor } from '../types';

/**
 * Two steps: pick WHO you are from a tile per saved user, then enter that
 * user's code. The old flow asked for a code cold and then offered the three
 * project logos; the logos are gone from login entirely — after the code you
 * land straight in the last-used workspace, and the header switcher is where
 * projects change.
 *
 * SECURITY — the ordering here is load-bearing (see store.loadUsersForLogin):
 * the real user list is fetched first and nothing is clickable until
 * `authReady`. The tiles render from that same authoritative list. A code is
 * refused unless it belongs to the tile that was picked — the store's login()
 * authenticates whoever owns the code, so without that check typing somebody
 * else's code on your tile would quietly sign you in as them.
 */
export function LoginPage() {
  const [step, setStep] = useState<'who' | 'code'>('who');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { login, mainUiStrings: s, users, currentProjectId, authReady, loadUsersForLogin } = useStore();
  const navigate = useNavigate();

  // Load the real user list before any code can be checked (see store.loadUsersForLogin)
  useEffect(() => { loadUsersForLogin(); }, []);
  useEffect(() => { if (step === 'code') inputRefs.current[0]?.focus(); }, [step]);

  const tiles = users.filter(u => u.active);
  const picked = tiles.find(u => u.id === pickedId) ?? null;

  function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '');
  }

  function pickUser(id: string) {
    setPickedId(id);
    setDigits(['', '', '', '', '', '']);
    setError('');
    setStep('code');
  }

  function handleDigit(idx: number, val: string) {
    if (!/^\d*$/.test(val)) return;
    const newDigits = [...digits];
    newDigits[idx] = val.slice(-1);
    setDigits(newDigits);
    setError('');
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (idx === 5 && val) {
      const code = [...newDigits.slice(0, 5), val].join('');
      if (code.length === 6 && authReady) attemptLogin(code);
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter') { const c = digits.join(''); if (c.length === 6 && authReady) attemptLogin(c); }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6 && authReady) { setDigits(text.split('')); setTimeout(() => attemptLogin(text), 50); }
  }

  function rejectCode() {
    setError(s.invalidCode);
    setShake(true);
    setDigits(['', '', '', '', '', '']);
    setTimeout(() => { setShake(false); inputRefs.current[0]?.focus(); }, 600);
  }

  function attemptLogin(code: string) {
    if (!authReady || !picked) return;
    // The code must be THIS tile's code. login() signs in whoever owns the
    // code, so the ownership check has to come before it runs.
    if (picked.code !== code) { rejectCode(); return; }
    const user = login(code);
    if (user && user.id === picked.id) {
      navigate(currentProjectId === 'general' ? '/jobs' : '/project');
    } else {
      rejectCode();
    }
  }

  return (
    <div className="min-h-screen relative flex items-stretch">
      {/* Left panel: building photo */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src="/wolfson-building.jpg"
          alt="W Residence – Wolfson Group"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, rgba(15,31,53,0.55) 0%, rgba(15,31,53,0.2) 60%, rgba(15,31,53,0.7) 100%)'
        }} />
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <p className="text-gray-300 text-sm leading-relaxed max-w-sm">
            {s.loginSubtitle}
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[420px] flex flex-col items-center justify-center px-10 py-12 relative"
        style={{ backgroundColor: '#0f1f35' }}>

        <div className="absolute inset-0 lg:hidden">
          <img src="/wolfson-building.jpg" alt="" className="w-full h-full object-cover opacity-20" />
        </div>

        <div className="relative z-10 w-full max-w-xs">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center mb-5">
              <img
                src="/tzviair-logo.png"
                alt="TzviAir"
                style={{ height: '64px', width: 'auto', display: 'block', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))' }}
              />
            </div>
            <p className="text-gray-500 text-xs tracking-wider mb-6">{s.loginFooterBrand}</p>
          </div>

          {step === 'who' ? (
            <>
              <p className="text-gray-400 text-sm text-center mb-6">{s.whoIsSigningIn}</p>
              {!authReady ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-[#4aa8d8] rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[46vh] overflow-y-auto pr-1">
                  {tiles.map(u => (
                    <button
                      key={u.id}
                      onClick={() => pickUser(u.id)}
                      className="flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border-2 border-white/10 hover:border-[#4aa8d8] transition-all hover:scale-[1.03] group"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                    >
                      <span
                        className="flex items-center justify-center w-14 h-14 rounded-full text-white text-lg font-black uppercase shadow-lg"
                        style={{ backgroundColor: personColor(u.name, u.color) }}
                      >
                        {initialsOf(u.name)}
                      </span>
                      <span className="text-gray-300 text-xs font-semibold group-hover:text-white transition-colors truncate max-w-full">
                        {u.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 mb-6">
                <span
                  className="flex items-center justify-center w-14 h-14 rounded-full text-white text-lg font-black uppercase shadow-lg"
                  style={{ backgroundColor: personColor(picked?.name ?? '', picked?.color) }}
                >
                  {initialsOf(picked?.name ?? '?')}
                </span>
                <span className="text-white text-sm font-bold">{picked?.name}</span>
                <p className="text-gray-400 text-xs">{s.enterCode}</p>
              </div>
              <div className={`${shake ? 'animate-bounce' : ''}`}>
                <div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el; }}
                      value={d}
                      onChange={e => handleDigit(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      maxLength={1}
                      inputMode="numeric"
                      disabled={!authReady}
                      className="text-center text-xl font-bold text-white bg-white/8 border-2 border-white/15 rounded-xl focus:outline-none focus:border-[#4aa8d8] transition-all disabled:opacity-40"
                      style={{ width: '44px', height: '50px', backgroundColor: 'rgba(255,255,255,0.07)' }}
                    />
                  ))}
                </div>
                {error && <div className="text-red-400 text-sm text-center mb-4 font-medium">{error}</div>}
                <button
                  onClick={() => { const c = digits.join(''); if (c.length === 6) attemptLogin(c); else setError(s.pleaseEnterDigits); }}
                  disabled={!authReady}
                  className="w-full py-3 font-semibold rounded-xl text-sm tracking-wide text-white transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #4aa8d8, #1e6fa5)' }}
                >
                  {authReady ? s.enterProject : '…'}
                </button>
                <button
                  onClick={() => { setStep('who'); setPickedId(null); setError(''); }}
                  className="w-full mt-3 py-2 flex items-center justify-center gap-1 text-gray-400 hover:text-white text-xs font-medium transition-colors"
                >
                  <ChevronLeft size={14} />
                  {s.goBack}
                </button>
              </div>
            </>
          )}

          <p className="text-center text-gray-600 text-xs mt-8">{s.footerText}</p>
        </div>
      </div>
    </div>
  );
}
