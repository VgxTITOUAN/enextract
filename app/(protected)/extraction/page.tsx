'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Toast from '@/components/Toast';
import { useToast } from '@/lib/useToast';

type Mode = 'immediate' | 'planifiee' | 'recurrente';

export default function ExtractionPage() {
  const [mode, setMode] = useState<Mode>('immediate');
  const [nb, setNb] = useState('');
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('08:00');
  const [rythme, setRythme] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const { toast, showToast, hideToast } = useToast();

  const today = new Date().toISOString().split('T')[0];

  const isValid = () => {
    if (!nb || parseInt(nb) < 1 || parseInt(nb) > 500) return false;
    if (mode !== 'immediate' && !date) return false;
    if (mode === 'recurrente' && !rythme) return false;
    return true;
  };

  const modeLabel = {
    immediate:  'Immédiate',
    planifiee:  'Planifiée',
    recurrente: 'Récurrente',
  };

  async function handleSubmit() {
    setLoading(true);
    setShowConfirm(false);

    try {
      const res = await fetch('/api/extraction', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nb:     parseInt(nb),
          date:   date || null,
          mode,
          heure,
          rythme: rythme || null,
        }),
      });

      const data = await res.json();

      if (res.status === 503) {
        showToast(data.error, 'warning');
        return;
      }

      if (!res.ok) {
        showToast(data.error || 'Erreur lors de l\'extraction.', 'error');
        return;
      }

      if (data.scheduled) {
        showToast(data.message, 'info');
        setNb(''); setDate(''); setHeure('08:00'); setRythme(''); setMode('immediate');
        return;
      }

      if (data.status === 'error') {
        showToast('Aucun prospect trouvé correspondant aux critères.', 'warning');
        return;
      }

      if (data.status === 'partial') {
        showToast(
          `Extraction partielle — ${data.nbSortie} prospects sortis sur ${nb} demandés. ${data.manquant} manquant(s).`,
          'warning'
        );
        setTimeout(() => router.push('/telechargement'), 2000);
        return;
      }

      // done
      showToast(`✓ ${data.nbSortie} prospects extraits — redirection...`, 'success');
      setTimeout(() => router.push('/telechargement'), 1500);

    } catch {
      showToast('Erreur réseau. Vérifiez votre connexion.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Topbar title="Extraction de prospects" userName="" />
      <main className="p-6">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm max-w-2xl">

          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <span>📝</span> Paramètres d'extraction
            </h2>
            <p className="text-xs text-gray-400 mt-1">Renseignez les paramètres puis validez.</p>
          </div>

          <div className="p-6">

            {/* Toggle mode */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-6">
              {(['immediate', 'planifiee', 'recurrente'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                    mode === m
                      ? 'bg-white shadow-sm text-[#4a7c00] font-bold'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'immediate'  && <span>⚡</span>}
                  {m === 'planifiee'  && <span>🕐</span>}
                  {m === 'recurrente' && <span>🔄</span>}
                  {m === 'immediate'  ? 'Immédiate' : m === 'planifiee' ? 'Planifiée' : 'Récurrente'}
                  {m === 'recurrente' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ml-1" style={{backgroundColor:'#7048e8'}}>Auto</span>
                  )}
                </button>
              ))}
            </div>

            {/* Nb prospects */}
            <div className="mb-4 max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nb prospects <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={500}
                placeholder="Ex : 50"
                value={nb}
                onChange={e => setNb(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100] focus:ring-2 focus:ring-green-100"
              />
              <p className="text-xs text-gray-400 mt-1">Entre 1 et 500 prospects.</p>
            </div>

            {/* Date — masquée en mode immédiat */}
            {mode !== 'immediate' && (
              <div className="mb-4 max-w-xs">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date de lancement <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100] focus:ring-2 focus:ring-green-100"
                />
                <p className="text-xs text-gray-400 mt-1">Date de lancement = date d'extraction.</p>
              </div>
            )}

            {/* Champs Planifiée */}
            {mode === 'planifiee' && (
              <div className="mb-4 max-w-xs">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heure de déclenchement <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={heure}
                  onChange={e => setHeure(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100] focus:ring-2 focus:ring-green-100"
                />
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 flex gap-2">
                  <span>ℹ️</span>
                  <span>L'extraction sera lancée automatiquement à la date et l'heure choisies. Vous recevrez une notification.</span>
                </div>
              </div>
            )}

            {/* Champs Récurrente */}
            {mode === 'recurrente' && (
              <div className="mb-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5 text-xs text-purple-700 flex gap-2 mb-4">
                  <span>🔄</span>
                  <span>La récurrence démarre à la date choisie. La quantité est modifiable semaine par semaine depuis la page Planification.</span>
                </div>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rythme <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={rythme}
                      onChange={e => setRythme(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100] focus:ring-2 focus:ring-green-100"
                    >
                      <option value="">-- Choisir --</option>
                      <option value="semaine">Chaque lundi</option>
                      <option value="demi-semaine">Lundi + Jeudi</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Heure <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={heure}
                      onChange={e => setHeure(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100] focus:ring-2 focus:ring-green-100"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Critères */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Critères de sélection</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-gray-400 text-xs">
                <div className="text-lg mb-1">🔽</div>
                Filtres métier — accessibles admin uniquement.<br />
                <span className="text-[11px]">Lots 1, 2, 3, 4 définis dans le code.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Les champs <span className="text-red-500 font-bold">*</span> sont obligatoires.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setNb(''); setDate(''); setHeure('08:00'); setRythme(''); setMode('immediate'); }}
                  className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ✕ Réinitialiser
                </button>
                <button
                  disabled={!isValid() || loading}
                  onClick={() => setShowConfirm(true)}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  style={{ backgroundColor: isValid() && !loading ? '#6bb100' : undefined }}
                >
                  {loading ? '⏳ En cours...' : mode === 'recurrente' ? '🔄 Activer la récurrence' : mode === 'planifiee' ? '🕐 Planifier' : '✓ Valider et extraire'}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Modal confirmation */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">
                  {mode === 'recurrente' ? 'Confirmer la récurrence' : 'Confirmer l\'extraction'}
                </h3>
                <button onClick={() => setShowConfirm(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
              </div>
              <div className="px-5 py-4 space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2.5">
                  <span className="text-gray-500">Mode</span>
                  <span className="font-semibold">{modeLabel[mode]}</span>
                </div>
                {mode !== 'immediate' && date && (
                  <div className="flex justify-between border-b border-gray-100 pb-2.5">
                    <span className="text-gray-500">Date de lancement</span>
                    <span className="font-semibold">{new Date(date).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-gray-100 pb-2.5">
                  <span className="text-gray-500">Nb prospects</span>
                  <span className="font-semibold">{nb}</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2.5">
                  <span className="text-gray-500">Source</span>
                  <span className="font-semibold">Sellsy (API)</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-gray-500">MàJ Sellsy</span>
                  <span className="font-semibold text-[#6bb100]">Uniquement si extraction OK</span>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 py-2 text-sm font-semibold text-white rounded-lg"
                  style={{ backgroundColor: '#6bb100' }}
                >
                  {mode === 'recurrente' ? '🔄 Activer' : '✓ Lancer'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Toast toast={toast} onClose={hideToast} />
    </>
  );
}