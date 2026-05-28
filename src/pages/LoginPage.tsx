import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';

export function LoginPage() {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { login } = useStore();
  const navigate = useNavigate();

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
      if (code.length === 6) attemptLogin(code);
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter') { const c = digits.join(''); if (c.length === 6) attemptLogin(c); }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) { setDigits(text.split('')); setTimeout(() => attemptLogin(text), 50); }
  }

  function attemptLogin(code: string) {
    const user = login(code);
    if (user) {
      navigate('/project');
    } else {
      setError('Invalid code. Please try again.');
      setShake(true);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => { setShake(false); inputRefs.current[0]?.focus(); }, 600);
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
        {/* Gradient overlay */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, rgba(15,31,53,0.55) 0%, rgba(15,31,53,0.2) 60%, rgba(15,31,53,0.7) 100%)'
        }} />

        {/* Project info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-10">
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(214,232,238,0.25)', backdropFilter: 'blur(8px)', border: '1px solid rgba(184,134,11,0.4)' }}>
                <svg width="32" height="26" viewBox="0 0 32 26" fill="none">
                  <path d="M2 3 L8 23 L16 9 L24 23 L30 3" stroke="#b8860b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div>
                <div className="text-white font-bold text-2xl tracking-[0.15em] uppercase">W Residence</div>
                <div className="text-gray-300 text-xs tracking-[0.2em] uppercase">by the Wolfson Group</div>
              </div>
            </div>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed max-w-sm">
            Internal project management system for HVAC installation tracking across all three buildings.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <svg width="18" height="14" viewBox="0 0 48 34" fill="none">
              <path d="M4 6 Q24 -2 44 6" stroke="#f5a623" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path d="M8 14 Q24 6 40 14" stroke="#4aa8d8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>
            <span className="text-gray-400 text-xs tracking-wider">
              <span className="text-white font-semibold italic">Tzvi</span>
              <span className="text-[#4aa8d8] font-semibold italic">Air</span>
              <span className="text-gray-400"> · Air Conditioning Engineering</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right panel: login form */}
      <div className="w-full lg:w-[420px] flex flex-col items-center justify-center px-10 py-12 relative"
        style={{ backgroundColor: '#0f1f35' }}>

        {/* Mobile: show building as background */}
        <div className="absolute inset-0 lg:hidden">
          <img src="/wolfson-building.jpg" alt="" className="w-full h-full object-cover opacity-20" />
        </div>

        <div className="relative z-10 w-full max-w-xs">
          {/* Logo */}
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-5">
              <svg width="52" height="38" viewBox="0 0 52 38" fill="none">
                <path d="M4 7 Q26 -2 48 7" stroke="#f5a623" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
                <path d="M6 14 Q26 4 46 14" stroke="#f9c840" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <path d="M8 21 Q26 11 44 21" stroke="#4aa8d8" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <path d="M10 28 Q26 18 42 28" stroke="#1e6fa5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              </svg>
              <div>
                <div>
                  <span className="text-4xl font-extrabold tracking-tight italic text-white">Tzvi</span>
                  <span className="text-4xl font-extrabold tracking-tight italic text-[#4aa8d8]">Air</span>
                </div>
                <div className="text-[10px] text-gray-500 tracking-[0.22em] uppercase">Air Conditioning Engineering</div>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-center mb-2">
              <div className="flex-1 h-px bg-white/8" />
              <div className="flex items-center gap-2 px-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(214,232,238,0.15)' }}>
                  <svg width="18" height="14" viewBox="0 0 28 22" fill="none">
                    <path d="M2 3 L7 19 L14 8 L21 19 L26 3" stroke="#b8860b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </div>
                <span className="text-[#b8860b] font-semibold tracking-[0.2em] uppercase text-sm">W Residence</span>
              </div>
              <div className="flex-1 h-px bg-white/8" />
            </div>
            <p className="text-gray-500 text-xs tracking-wider mb-6">WOLFSON GROUP · PROJECT MANAGEMENT</p>

            <p className="text-gray-400 text-sm">Enter your access code</p>
          </div>

          {/* Code input */}
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
                  className="text-center text-xl font-bold text-white bg-white/8 border-2 border-white/15 rounded-xl focus:outline-none focus:border-[#4aa8d8] transition-all"
                  style={{ width: '44px', height: '50px', backgroundColor: 'rgba(255,255,255,0.07)' }}
                />
              ))}
            </div>

            {error && <div className="text-red-400 text-sm text-center mb-4 font-medium">{error}</div>}

            <button
              onClick={() => { const c = digits.join(''); if (c.length === 6) attemptLogin(c); else setError('Please enter all 6 digits.'); }}
              className="w-full py-3 font-semibold rounded-xl text-sm tracking-wide text-white transition-all hover:opacity-90 active:scale-98"
              style={{ background: 'linear-gradient(135deg, #4aa8d8, #1e6fa5)' }}
            >
              Enter Project
            </button>
          </div>

          <p className="text-center text-gray-600 text-xs mt-8">TzviAir Internal System</p>
        </div>
      </div>
    </div>
  );
}
