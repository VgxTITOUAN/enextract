'use client';

import { useState } from 'react';

type Extraction = {
  id: number;
  type: string;
  date_lancement: string;
  nb_demande: number;
  nb_sortie: number;
  nb_maj_sellsy: number;
  chemin_fichier: string | null;
  status: string;
  created_at: string;
  user_name: string;
};

type Prospect = {
  id:                  number;
  sellsy_id:           string;
  company_name:        string;
  website:             string | null;
  address:             string | null;
  city:                string | null;
  phone:               string | null;
  phone_mobile:        string | null;
  date_mailing_before: string | null;
  date_mailing_after:  string | null;
  sellsy_updated:      number;
};

type Kpis = {
  total: number;
  prospects: number;
  maj: number;
  derniere: string | null;
};

type Prochaine = {
  date_lancement: string;
  nb_prospects: number;
  user_name: string;
} | null;

interface Props {
  extractions: Extraction[];
  kpis: Kpis;
  prochaine: Prochaine;
  isAdmin: boolean;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    done:    'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    error:   'bg-red-100 text-red-600',
    pending: 'bg-gray-100 text-gray-500',
  };
  const label: Record<string, string> = {
    done: 'Succès', partial: 'Partiel', error: 'Erreur', pending: 'En cours',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {label[s] ?? s}
    </span>
  );
};

const typeBadge = (t: string) => {
  const map: Record<string, string> = {
    immediate:  'bg-green-50 text-green-700',
    planifiee:  'bg-amber-50 text-amber-700',
    recurrente: 'bg-purple-50 text-purple-700',
  };
  const label: Record<string, string> = {
    immediate: '⚡ Immédiate', planifiee: '🕐 Planifiée', recurrente: '🔄 Récurrente',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[t] ?? 'bg-gray-100 text-gray-500'}`}>
      {label[t] ?? t}
    </span>
  );
};

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TelechargementClient({ extractions, kpis, prochaine, isAdmin }: Props) {
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState<number | 'all'>(currentYear);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ extraction: Extraction; prospects: Prospect[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState('done');
  const [extractionList, setExtractionList] = useState<Extraction[]>(extractions);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const years = [...new Set(extractionList.map(e => new Date(e.created_at).getFullYear()))].sort((a, b) => b - a);

  const filtered = extractionList.filter(e => {
    const year = new Date(e.created_at).getFullYear();
    if (activeYear !== 'all' && year !== activeYear) return false;
    if (search && !e.user_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function openDetail(e: Extraction) {
    setLoadingDetail(e.id);
    try {
      const res  = await fetch(`/api/telechargement/${e.id}`);
      const data = await res.json();
      if (!res.ok) { showToast(data.error, false); return; }
      setDetail({ extraction: e, prospects: data.prospects });
      setDetailSearch('');
    } catch {
      showToast('Erreur réseau.', false);
    } finally {
      setLoadingDetail(null);
    }
  }

  async function corrigerStatut(id: number) {
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'correct_status', extraction_id: id, status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      setExtractionList(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
      showToast('Statut corrigé.');
      setCorrecting(null);
    } catch {
      showToast('Erreur réseau.', false);
    }
  }

  const filteredProspects = detail?.prospects.filter(p =>
    !detailSearch ||
    p.company_name?.toLowerCase().includes(detailSearch.toLowerCase()) ||
    p.city?.toLowerCase().includes(detailSearch.toLowerCase())
  ) ?? [];

  return (
    <div>
      {/* Prochaine extraction */}
      {prochaine && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold text-blue-700">🕐 Prochaine extraction planifiée</span>
            <span className="text-gray-500 ml-3">
              {fmtDate(prochaine.date_lancement)} — {prochaine.nb_prospects} prospects ({prochaine.user_name})
            </span>
          </div>
          <a href="/planification" className="text-blue-600 text-xs font-semibold hover:underline">
            Voir la planification →
          </a>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Extractions', value: filtered.length },
          { label: 'Nb prospects sorties', value: filtered.reduce((s, e) => s + (e.nb_sortie || 0), 0) },
          { label: 'Sellsy MàJ', value: filtered.reduce((s, e) => s + (e.nb_maj_sellsy || 0), 0) },
          { label: 'Dernière extraction', value: kpis.derniere ? fmtDate(kpis.derniere) : '—', small: true },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`font-bold text-gray-800 ${(k as any).small ? 'text-base mt-1' : 'text-2xl'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveYear('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                activeYear === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tout
            </button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setActiveYear(y)}
                className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
                style={activeYear === y
                  ? { backgroundColor: '#6bb100', borderColor: '#6bb100', color: 'white' }
                  : { backgroundColor: 'white', color: '#6c757d', borderColor: '#dee2e6' }
                }
              >
                {y}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#6bb100] w-40"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ display: isAdmin ? 'table-cell' : 'none' }}>Utilisateur</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Nb demandé</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Nb sorties</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sellsy MàJ</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 text-xs">
                    Aucune extraction pour cette période.
                  </td>
                </tr>
              ) : (
                filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 text-xs">{fmtDate(e.created_at)}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(e.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3">{typeBadge(e.type)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600" style={{ display: isAdmin ? 'table-cell' : 'none' }}>
                      {e.user_name}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{e.nb_demande}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: e.nb_sortie < e.nb_demande ? '#f59f00' : '#4a7c00' }}>
                      {e.nb_sortie}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.status === 'error' ? '—' : e.nb_maj_sellsy}</td>
                    <td className="px-4 py-3">{statusBadge(e.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Voir le détail */}
                        <button
                          onClick={() => openDetail(e)}
                          disabled={loadingDetail === e.id}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 hover:bg-blue-100 hover:text-blue-600 text-gray-500 transition-colors text-xs"
                          title="Voir le détail"
                        >
                          {loadingDetail === e.id ? '⏳' : '🔍'}
                        </button>
                        {/* Télécharger CSV */}
                        <a
                          href={`/api/telechargement/${e.id}?format=csv`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 hover:bg-[#6bb100] hover:text-white text-gray-500 transition-colors text-xs"
                          title="Télécharger CSV"
                        >
                          ⬇
                        </a>
                        {/* Corriger statut */}
                        {e.status !== 'done' && (
                          <button
                            onClick={() => { setCorrecting(e.id); setNewStatus('done'); }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-500 transition-colors text-xs"
                            title="Corriger le statut"
                          >
                            🔧
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          {filtered.length} extraction(s) affichée(s)
        </div>
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

      {/* Modal détail */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">
                  Détail — Extraction #{detail.extraction.id}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDate(detail.extraction.created_at)} · {detail.extraction.user_name} · {detail.prospects.length} prospect(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/telechargement/${detail.extraction.id}?format=csv`}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors"
                  style={{ backgroundColor: '#6bb100' }}
                >
                  ⬇ Télécharger CSV
                </a>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
              </div>
            </div>

            {/* Méta */}
            <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-4 gap-3">
              {[
                { label: 'Type',        value: detail.extraction.type },
                { label: 'Nb demandé', value: detail.extraction.nb_demande },
                { label: 'Nb sorties', value: detail.extraction.nb_sortie },
                { label: 'Statut',     value: statusBadge(detail.extraction.status) },
              ].map(m => (
                <div key={m.label}>
                  <p className="text-xs text-gray-400">{m.label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{m.value}</p>
                </div>
              ))}
            </div>

            {/* Recherche */}
            <div className="px-5 py-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Rechercher un prospect..."
                value={detailSearch}
                onChange={e => setDetailSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#6bb100]"
              />
            </div>

            {/* Table prospects */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Société</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Site web</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Adresse</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Ville</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Tél fixe</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Tél mobile</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-400 uppercase tracking-wide">Sellsy MàJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProspects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400">
                        {detail.prospects.length === 0 ? 'Aucun prospect pour cette extraction.' : 'Aucun résultat.'}
                      </td>
                    </tr>
                  ) : (
                    filteredProspects.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.company_name || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 max-w-[140px] truncate">
                          {p.website
                            ? <a href={p.website} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-500">{p.website.replace(/^https?:\/\//, '')}</a>
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{p.address || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.city || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.phone || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.phone_mobile || '—'}</td>
                        <td className="px-4 py-2.5 text-center">
                          {p.sellsy_updated
                            ? <span className="text-green-600 font-semibold">✓</span>
                            : <span className="text-red-400">✕</span>
                          }
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal correction statut */}
      {correcting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Correction manuelle du statut</h3>
              <button onClick={() => setCorrecting(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="px-5 py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
                ⚠️ À utiliser uniquement en cas d'erreur technique avérée.
              </div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nouveau statut</label>
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100]"
              >
                <option value="done">Succès</option>
                <option value="partial">Partiel</option>
                <option value="error">Erreur</option>
              </select>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setCorrecting(null)} className="flex-1 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={() => corrigerStatut(correcting)}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-lg"
                style={{ backgroundColor: '#6bb100' }}
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}