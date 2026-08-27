import React from 'react';

/**
 * A crash that says WHAT broke, instead of a white page.
 *
 * The owner reported "dragging to a corner makes the site crash" — and a
 * React render error unmounts everything, so all he could tell us was
 * "crash". This boundary catches it and shows the error's own words plus
 * the top of the component stack, with one button to reload and one to copy
 * the details — turning the next report into an exact sentence.
 *
 * Deliberately dependency-free and store-free: the store itself may be what
 * crashed, so this screen reads nothing from it. Reload is the only action —
 * localStorage and Firestore already hold the data, so nothing is lost.
 */
interface State { error: Error | null; stack: string }

export class CrashScreen extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ stack: String(info.componentStack ?? '').trim() });
    // Also in the console, whole, for anyone with devtools open.
    console.error('APP CRASH:', error, info.componentStack);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const detail = `${error.message}\n\n${String(error.stack ?? '').split('\n').slice(0, 8).join('\n')}`
      + (stack ? `\n\nComponent stack:\n${stack.split('\n').slice(0, 10).join('\n')}` : '');
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', padding: 20, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          maxWidth: 640, width: '100%', background: '#ffffff', borderRadius: 18,
          boxShadow: '0 20px 60px rgba(15,23,42,.18)', padding: '26px 28px',
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
            Something broke on this screen
          </div>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>
            Nothing is lost — the data is saved. Press Reload to carry on, and send
            the words below to whoever is fixing it.
            <span dir="rtl" style={{ display: 'block', marginTop: 2 }}>
              שום דבר לא אבד — הנתונים שמורים. לחצו על Reload והעבירו את הטקסט למי שמתקן.
            </span>
          </div>
          <pre data-crash-detail style={{
            margin: 0, marginBottom: 16, padding: '10px 12px', background: '#0f172a',
            color: '#fda4af', borderRadius: 10, fontSize: 11.5, lineHeight: 1.45,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto',
          }}>{detail}</pre>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#1e3a5f', color: '#fff', fontSize: 13.5, fontWeight: 700,
              }}>
              Reload
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(detail).catch(() => {}); }}
              style={{
                padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5,
                fontWeight: 700, background: '#fff', color: '#334155', border: '1px solid #cbd5e1',
              }}>
              Copy the details
            </button>
          </div>
        </div>
      </div>
    );
  }
}
