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

    if (val && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }

    // Auto-submit when last digit filled
    if (idx === 5 && val) {
      const code = [...newDigits.slice(0, 5), val].join('');
      if (code.length === 6) attemptLogin(code);
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const code = digits.join('');
      if (code.length === 6) attemptLogin(code);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(''));
      setTimeout(() => attemptLogin(text), 50);
    }
  }

  function attemptLogin(code: string) {
    const user = login(code);
    if (user) {
      navigate('/project');
    } else {
      setError('Invalid code. Please try again.');
      setShake(true);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        setShake(false);
        inputRefs.current[0]?.focus();
      }, 600);
    }
  }

  function handleSubmit() {
    const code = digits.join('');
    if (code.length < 6) {
      setError('Please enter all 6 digits.');
      return;
    }
    attemptLogin(code);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] via-[#162d4a] to-[#0f1f35] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logos */}
        <div className="text-center mb-8">
          {/* TzviAir logo */}
          <div className="inline-flex flex-col items-center mb-5">
            <div className="flex items-center gap-3 mb-1">
              <svg width="52" height="38" viewBox="0 0 52 38" fill="none">
                <path d="M26 5 C16 5 6 14 2 32" stroke="#f5a623" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <path d="M26 5 C36 5 46 14 50 32" stroke="#4aa8d8" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <path d="M26 5 C26 14 26 23 26 32" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M26 5 C20 14 18 23 16 32" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
                <path d="M26 5 C32 14 34 23 36 32" stroke="#4aa8d8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
              </svg>
              <span className="text-4xl font-bold tracking-tight">
                <span className="text-white">Tzvi</span>
                <span className="text-[#4aa8d8]">Air</span>
              </span>
            </div>
            <div className="text-[11px] text-gray-400 tracking-widest uppercase">Air Conditioning Engineering</div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#d6e8ee] flex items-center justify-center">
                <span className="text-[#b8860b] font-bold text-xl leading-none">W</span>
              </div>
              <div className="text-left">
                <div className="text-[#d6e8ee] font-semibold text-sm tracking-widest">WOLFSON</div>
                <div className="text-gray-500 text-[10px] tracking-wider uppercase">Residence</div>
              </div>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <h1 className="text-white text-xl font-semibold mb-1">Project Access</h1>
          <p className="text-gray-400 text-sm">Enter your 6-digit access code</p>
        </div>

        {/* Code input */}
        <div className={`bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-7 ${shake ? 'animate-bounce' : ''}`}>
          <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                maxLength={1}
                inputMode="numeric"
                className="w-11 h-13 text-center text-xl font-bold text-white bg-white/10 border-2 border-white/20 rounded-xl focus:outline-none focus:border-[#4aa8d8] transition-all"
                style={{ height: '52px' }}
              />
            ))}
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center mb-4 font-medium">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-[#4aa8d8] hover:bg-[#3a8fc0] text-white font-semibold rounded-xl transition-colors text-sm tracking-wide"
          >
            Enter Project
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          TzviAir Internal Tool · Wolfson Project
        </p>
      </div>
    </div>
  );
}
