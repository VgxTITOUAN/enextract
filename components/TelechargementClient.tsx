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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TelechargementClient({ extractions, kpis, prochaine, isAdmin }: Props) {
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState<number | 'all'>(currentYear);
  const [search, setSearch] = useState('');

  const years = [...new Set(extractions.map(e => new Date(e.created_at).getFullYear()))].sort((a, b) => b - a);

  const filtered = extractions.filter(e => {
    const year = new Date(e.created_at).getFullYear();
    if (activeYear !== 'all' && year !== activeYear) return false;
    if (search && !e.user_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {/* Prochaine extraction planifiée */}
      {prochaine && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between text-sm">
          <div>
            <span className="font-semibold text-blue-700">🕐 Prochaine extraction planifiée</span>
            <span className="text-gray-500 ml-3">
              {new Date(prochaine.date_lancement).toLocaleDateString('fr-FR')} — {prochaine.nb_prospects} prospects ({prochaine.user_name})
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
                activeYear === 'all'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Tout
            </button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setActiveYear(y)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  activeYear === y ? 'text-white' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                }`}
                style={activeYear === y ? { backgroundColor: '#6bb100', borderColor: '#6bb100' } : {}}
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
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Fichier</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Corriger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400 text-xs">
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
                    <td className="px-4 py-3 text-center">
                      {e.chemin_fichier ? (
                        <a
                          href={`/api/telechargement/${e.id}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 hover:bg-[#6bb100] hover:text-white text-gray-500 transition-colors text-xs"
                        >
                          ⬇
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.status !== 'done' ? (
                        <button
                          onClick={() => alert('Correction statut — à implémenter')}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-500 transition-colors text-xs"
                          title="Corriger le statut"
                        >
                          🔧
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
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
    </div>
  );
}