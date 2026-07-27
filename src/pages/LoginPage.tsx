import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';

export function LoginPage() {
  const [step, setStep] = useState<'code' | 'project'>('code');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { login, mainUiStrings: s, projects, setCurrentProject, authReady, loadUsersForLogin } = useStore();
  const navigate = useNavigate();

  // Load the real user list before any code can be checked (see store.loadUsersForLogin)
  useEffect(() => { loadUsersForLogin(); }, []);
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

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

  function attemptLogin(code: string) {
    if (!authReady) return;
    const user = login(code);
    if (user) {
      setStep('project');
    } else {
      setError(s.invalidCode);
      setShake(true);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => { setShake(false); inputRefs.current[0]?.focus(); }, 600);
    }
  }

  function pickProject(id: string) {
    setCurrentProject(id);
    navigate('/project');
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

          {step === 'code' ? (
            <>
              <p className="text-gray-400 text-sm text-center mb-6">{s.enterCode}</p>
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
              </div>
            </>
          ) : (
            <div>
              <p className="text-gray-400 text-sm text-center mb-8">{s.switchProject}</p>
              <div className="flex gap-6 justify-center">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => pickProject(p.id)}
                    className="flex flex-col items-center gap-3 group"
                  >
                    <div className="rounded-2xl overflow-hidden border-2 border-white/15 hover:border-[#4aa8d8] transition-all group-hover:scale-105 group-hover:shadow-lg"
                      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                      <img src={p.logoPath} alt={p.name} className="h-24 w-auto block" />
                    </div>
                    <span className="text-gray-400 text-xs group-hover:text-white transition-colors">{p.shortName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-gray-600 text-xs mt-8">{s.footerText}</p>
        </div>
      </div>
    </div>
  );
}
