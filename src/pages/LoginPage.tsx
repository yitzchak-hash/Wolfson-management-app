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

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

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
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #162d4a 50%, #0f1f35 100%)' }}>
      <div className="w-full max-w-sm">
        {/* TzviAir logo */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center mb-6">
            <svg width="160" height="52" viewBox="0 0 160 52" fill="none" className="mb-2">
              {/* Swoosh arcs */}
              <path d="M8 14 Q56 0 108 14" stroke="#f5a623" strokeWidth="4" strokeLinecap="round" fill="none"/>
              <path d="M10 22 Q56 8 106 22" stroke="#f9c840" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              <path d="M12 30 Q56 16 104 30" stroke="#4aa8d8" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path d="M14 38 Q56 24 102 38" stroke="#1e6fa5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            </svg>
            <div className="flex items-baseline gap-0.5">
              <span className="text-5xl font-extrabold tracking-tight text-white" style={{ fontStyle: 'italic' }}>Tzvi</span>
              <span className="text-5xl font-extrabold tracking-tight text-[#4aa8d8]" style={{ fontStyle: 'italic' }}>Air</span>
            </div>
            <div className="text-[11px] text-gray-400 tracking-[0.25em] uppercase mt-1">Air Conditioning Engineering</div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#d6e8ee' }}>
                <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
                  <path d="M2 2 L6.5 18 L13 7 L19.5 18 L24 2"
                    stroke="#b8860b" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </div>
              <div className="text-left">
                <div className="text-[#d6e8ee] font-semibold text-sm tracking-[0.2em] uppercase">Wolfson</div>
                <div className="text-gray-400 text-[9px] tracking-[0.15em] uppercase">Residence · Project Management</div>
              </div>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <p className="text-gray-400 text-sm">Enter your 6-digit access code</p>
        </div>

        {/* Code input */}
        <div className={`bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-7 ${shake ? 'animate-bounce' : ''}`}>
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
                className="text-center text-xl font-bold text-white bg-white/10 border-2 border-white/20 rounded-xl focus:outline-none focus:border-[#4aa8d8] transition-all"
                style={{ width: '48px', height: '52px' }}
              />
            ))}
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center mb-4 font-medium">{error}</div>
          )}

          <button
            onClick={() => { const c = digits.join(''); if (c.length === 6) attemptLogin(c); else setError('Please enter all 6 digits.'); }}
            className="w-full py-3 font-semibold rounded-xl transition-colors text-sm tracking-wide text-white"
            style={{ backgroundColor: '#4aa8d8' }}
          >
            Enter Project
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">TzviAir Internal Tool · Wolfson Project</p>
      </div>
    </div>
  );
}
