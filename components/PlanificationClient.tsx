'use client';

import { useState } from 'react';

type Schedule = {
  id: number;
  user_id: number;
  user_name: string;
  type: string;
  rythme: string | null;
  date_lancement: string;
  heure: string | null;
  nb_prospects: number;
  actif: number;
  created_at: string;
};

interface Props {
  recurrentes: Schedule[];
  planifiees:  Schedule[];
  currentUserId: number;
  isAdmin: boolean;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function prochainLundi(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 1 ? 7 : (1 + 7 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function prochainJeudi(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 4 ? 7 : (4 + 7 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function getProchainesDates(s: Schedule): string[] {
  if (s.type === 'planifiee') return [fmtDatetime(s.date_lancement)];
  if (s.rythme === 'semaine') return [prochainLundi()];
  if (s.rythme === 'demi-semaine') return [prochainLundi(), prochainJeudi()];
  return [];
}

export default function PlanificationClient({ recurrentes: initRec, planifiees: initPlan, currentUserId, isAdmin }: Props) {
  const [recurrentes, setRecurrentes] = useState<Schedule[]>(initRec);
  const [planifiees,  setPlanifiees]  = useState<Schedule[]>(initPlan);
  const [loadingId,   setLoadingId]   = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editNb, setEditNb] = useState<{ id: number; value: string } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleSchedule(id: number) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/planification', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'toggle', id }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      setRecurrentes(prev => prev.map(s => s.id === id ? { ...s, actif: data.actif ? 1 : 0 } : s));
      showToast(data.actif ? 'Récurrence activée.' : 'Récurrence désactivée.');
    } catch {
      showToast('Erreur réseau.', false);
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteSchedule(id: number, type: string) {
    if (!confirm('Supprimer cette planification ?')) return;
    setLoadingId(id);
    try {
      const res = await fetch('/api/planification', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      if (type === 'recurrente') setRecurrentes(prev => prev.filter(s => s.id !== id));
      else setPlanifiees(prev => prev.filter(s => s.id !== id));
      showToast('Planification supprimée.');
    } catch {
      showToast('Erreur réseau.', false);
    } finally {
      setLoadingId(null);
    }
  }

  async function updateNb(id: number) {
    if (!editNb) return;
    const nb = parseInt(editNb.value);
    if (!nb || nb < 1 || nb > 500) { showToast('Nb invalide.', false); return; }
    try {
      const res = await fetch('/api/planification', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'update_nb', id, nb }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      setRecurrentes(prev => prev.map(s => s.id === id ? { ...s, nb_prospects: nb } : s));
      showToast('Nb mis à jour.');
      setEditNb(null);
    } catch {
      showToast('Erreur réseau.', false);
    }
  }

  const canManage = (s: Schedule) => isAdmin || s.user_id === currentUserId;

  return (
    <div>

      {/* ── Récurrentes ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border" style={{ color: '#7048e8', backgroundColor: '#f3f0ff', borderColor: '#c5b8f7' }}>
              🔄 Récurrentes
            </span>
            <span className="text-xs text-gray-400">{recurrentes.length} règle(s)</span>
          </div>
          <a
            href="/extraction"
            className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
            style={{ backgroundColor: '#6bb100' }}
          >
            + Nouvelle récurrence
          </a>
        </div>

        {recurrentes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            <div className="text-2xl mb-2">🔄</div>
            Aucune récurrence active. <a href="/extraction" className="text-[#6bb100] font-semibold hover:underline">En créer une →</a>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Règle</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Prochaines dates</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Nb / semaine</th>
                  {isAdmin && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Créée par</th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recurrentes.map(s => (
                  <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${!s.actif ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 text-xs">
                        {s.rythme === 'semaine' ? 'Chaque lundi' : 'Lundi + Jeudi'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {s.heure ?? '08:00'} · depuis {fmtDate(s.date_lancement)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {getProchainesDates(s).map((d, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#e7f5ff', color: '#1971c2' }}>
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editNb?.id === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={editNb.value}
                            onChange={e => setEditNb({ id: s.id, value: e.target.value })}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-[#6bb100]"
                            min={1} max={500}
                          />
                          <button onClick={() => updateNb(s.id)} className="text-xs text-green-600 font-semibold hover:underline">✓</button>
                          <button onClick={() => setEditNb(null)} className="text-xs text-gray-400 hover:underline">✕</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{s.nb_prospects}</span>
                          {canManage(s) && (
                            <button onClick={() => setEditNb({ id: s.id, value: String(s.nb_prospects) })} className="text-xs text-gray-400 hover:text-gray-600">✏️</button>
                          )}
                        </div>
                      )}
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-xs text-gray-500">{s.user_name}</td>}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {s.actif ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {canManage(s) && (
                          <>
                            <button
                              onClick={() => toggleSchedule(s.id)}
                              disabled={loadingId === s.id}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                                s.actif ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                            >
                              {s.actif ? '⊘' : '✓'}
                            </button>
                            <button
                              onClick={() => deleteSchedule(s.id, s.type)}
                              disabled={loadingId === s.id}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Planifiées ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border" style={{ color: '#864d00', backgroundColor: '#fff9db', borderColor: '#ffe066' }}>
            🕐 Planifiées
          </span>
          <span className="text-xs text-gray-400">{planifiees.length} en attente</span>
        </div>

        {planifiees.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            <div className="text-2xl mb-2">🕐</div>
            Aucune extraction planifiée.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date de lancement</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Heure</th>
                  {isAdmin && <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Planifiée par</th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Nb</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Annuler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {planifiees.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-800 text-xs">{fmtDatetime(s.date_lancement)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{s.heure ?? '—'}</td>
                    {isAdmin && <td className="px-4 py-3 text-xs text-gray-500">{s.user_name}</td>}
                    <td className="px-4 py-3 font-semibold text-gray-800">{s.nb_prospects}</td>
                    <td className="px-4 py-3 text-center">
                      {canManage(s) && (
                        <button
                          onClick={() => deleteSchedule(s.id, s.type)}
                          disabled={loadingId === s.id}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-400 transition-colors text-xs disabled:opacity-50"
                          title="Annuler"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg z-50"
          style={{ backgroundColor: toast.ok ? '#4a7c00' : '#e03131' }}
        >
          {toast.msg}
        </div>
      )}

    </div>
  );
}