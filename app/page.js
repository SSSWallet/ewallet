'use client';
import { useState, useEffect, useRef } from 'react';

export default function CassaLido() {
  const [tab, setTab] = useState('reg');
  const [toast, setToast] = useState({ show: false, message: '', isSuccess: true });
  
  // Form Reg
  const [regUid, setRegUid] = useState('');
  const [regName, setRegName] = useState('');
  const [regBalance, setRegBalance] = useState('0.00');
  
  // Form Topup
  const [topupUid, setTopupUid] = useState('');
  const [topupAmount, setTopupAmount] = useState('');

  const regInputRef = useRef(null);
  const topupInputRef = useRef(null);

  useEffect(() => {
    if (tab === 'reg') regInputRef.current?.focus();
    if (tab === 'topup') topupInputRef.current?.focus();
  }, [tab]);

  const showToast = (message, isSuccess = true) => {
    setToast({ show: true, message, isSuccess });
    setTimeout(() => setToast({ show: false, message: '', isSuccess: true }), 4500);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/register-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: regUid.trim(), name: regName.trim(), initial_balance: regBalance })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Tessera attivata con successo per: ${regName || 'Ospite Anonimo'}`);
        setRegUid(''); setRegName(''); setRegBalance('0.00');
        regInputRef.current?.focus();
      } else {
        showToast(`Errore: ${data.error}`, false);
      }
    } catch {
      showToast("Errore di connessione con le Serverless Vercel.", false);
    }
  };

  const handleTopup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: topupUid.trim(), amount: topupAmount })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Ricarica eseguita! Nuovo Saldo: €${parseFloat(data.new_balance).toFixed(2)}`);
        setTopupUid(''); setTopupAmount('');
        topupInputRef.current?.focus();
      } else {
        showToast(`Errore: ${data.error}`, false);
      }
    } catch {
      showToast("Errore di connessione con le Serverless Vercel.", false);
    }
  };

  return (
    <div className="bg-slate-50 font-sans min-h-screen text-slate-800 antialiased">
      {/* Script Tailwind per Next.js */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tailwindcss/ui@latest/dist/tailwind-ui.min.css"/>
      
      <nav className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🏖️</span>
            <h1 className="text-lg font-black tracking-wider uppercase">Lido eWallet <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full lowercase">vercel-v3</span></h1>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-black uppercase">Serverless</span>
        </div>
      </nav>

      <main className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-slate-200/70 p-1.5 rounded-2xl flex space-x-1 mb-6 shadow-inner">
          <button onClick={() => setTab('reg')} className={`flex-1 py-3 text-sm font-black tracking-wide uppercase rounded-xl transition-all ${tab === 'reg' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}>➕ Nuova Scheda</button>
          <button onClick={() => setTab('topup')} className={`flex-1 py-3 text-sm font-black tracking-wide uppercase rounded-xl transition-all ${tab === 'topup' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600'}`}>⚡ Ricarica</button>
        </div>

        {tab === 'reg' ? (
          <section className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
            <div className="mb-5">
              <h2 className="text-xl font-black text-slate-900">Inizializza Tessera</h2>
              <p className="text-xs text-slate-400 mt-0.5">Assegna un codice UID vergine a un nuovo ospite.</p>
            </div>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">1. UID Carta (Passa sul lettore)</label>
                <input ref={regInputRef} type="text" required value={regUid} onChange={(e) => setRegUid(e.target.value)} placeholder="In attesa della lettura..." className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-mono font-bold text-center tracking-widest outline-none border-blue-500"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">2. Nome Ospite / Ombrellone</label>
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Es. Ombrellone 12" className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">3. Carico Denaro Iniziale (€)</label>
                <input type="number" step="0.01" value={regBalance} onChange={(e) => setRegBalance(e.target.value)} className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-blue-600 text-lg text-center outline-none"/>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold p-4 rounded-xl text-sm uppercase tracking-wider mt-2 shadow-md">🚀 Attiva Tessera Vercel</button>
            </form>
          </section>
        ) : (
          <section className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
            <div className="mb-5">
              <h2 className="text-xl font-black text-slate-900">Ricarica Rapida Cassa</h2>
              <p className="text-xs text-slate-400 mt-0.5">Aggiungi credito digitale su una tessera esistente.</p>
            </div>
            <form onSubmit={handleTopup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">UID Carta (Passa sul lettore)</label>
                <input ref={topupInputRef} type="text" required value={topupUid} onChange={(e) => setTopupUid(e.target.value)} placeholder="In attesa della lettura..." className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-mono font-bold text-center tracking-widest outline-none border-emerald-500"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Importo Cash da Aggiungere (€)</label>
                <input type="number" step="0.01" required value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="0.00" className="w-full p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-emerald-600 text-lg text-center outline-none"/>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold p-4 rounded-xl text-sm uppercase tracking-wider mt-2 shadow-md">💰 Conferma ed Incassa</button>
            </form>
          </section>
        )}
      </main>

      {toast.show && (
        <div className={`fixed bottom-6 right-6 text-white px-6 py-4 rounded-2xl shadow-2xl font-bold flex items-center space-x-3 z-50 max-w-sm border ${toast.isSuccess ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'}`}>
          <span>{toast.isSuccess ? '🎉' : '⚠️'}</span>
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
