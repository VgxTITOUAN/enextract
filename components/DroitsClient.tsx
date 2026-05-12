'use client';

import { useState } from 'react';

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  active: number;
  derniere_connexion: string | null;
  created_at: string;
};

interface Props {
  users: User[];
  currentUserId: number;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DroitsClient({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showReset, setShowReset] = useState<{ id: number; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'commercial' });
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const admins      = users.filter(u => u.role === 'admin');
  const commerciaux = users.filter(u => u.role === 'commercial');

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleUser(id: number) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'toggle', user_id: id }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      setUsers(prev => prev.map(u => u.id === id ? { ...u, active: data.active ? 1 : 0 } : u));
      showToast(`${data.name} est maintenant ${data.active ? 'activé' : 'désactivé'}.`);
    } catch {
      showToast('Erreur réseau.', false);
    } finally {
      setLoadingId(null);
    }
  }

  async function resetPassword() {
    if (!showReset || newPassword.length < 8) return;
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'reset_password', user_id: showReset.id, new_password: newPassword }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      showToast(`Mot de passe de ${data.name} réinitialisé.`);
      setShowReset(null);
      setNewPassword('');
    } catch {
      showToast('Erreur réseau.', false);
    }
  }

  async function createUser() {
    if (!form.name || !form.email || form.password.length < 8) return;
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'create', ...form }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.error, false); return; }
      setUsers(prev => [...prev, data.user]);
      showToast(`Utilisateur ${data.user.name} créé.`);
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'commercial' });
    } catch {
      showToast('Erreur réseau.', false);
    }
  }

  const UserCard = ({ u }: { u: User }) => {
    const isSelf    = u.id === currentUserId;
    const isActive  = u.active === 1;

    return (
      <div className={`flex items-center gap-3 p-4 border border-gray-200 rounded-xl mb-2 transition-opacity ${!isActive ? 'opacity-60' : ''}`}>
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: !isActive ? '#adb5bd' : u.role === 'admin' ? '#1971c2' : '#6bb100' }}
        >
          {u.name.charAt(0).toUpperCase()}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{u.name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
              {u.role === 'admin' ? 'Admin' : 'Commercial'}
            </span>
            {isSelf && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Vous</span>}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {isActive ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</div>
          <div className="text-xs text-gray-400">Dernière connexion : {fmtDate(u.derniere_connexion)}</div>
        </div>

        {/* Actions */}
        {!isSelf && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => toggleUser(u.id)}
              disabled={loadingId === u.id}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                isActive
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              {loadingId === u.id ? '...' : isActive ? '⊘ Désactiver' : '✓ Activer'}
            </button>
            <button
              onClick={() => setShowReset({ id: u.id, name: u.name })}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              title="Réinitialiser le mot de passe"
            >
              🔑
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-gray-800">Utilisateurs ({users.length})</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gérez les accès à EneXtract.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
          style={{ backgroundColor: '#6bb100' }}
        >
          + Nouvel utilisateur
        </button>
      </div>

      {/* Admins */}
      {admins.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Admins</p>
          {admins.map(u => <UserCard key={u.id} u={u} />)}
        </div>
      )}

      {/* Commerciaux */}
      {commerciaux.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Commerciaux</p>
          {commerciaux.map(u => <UserCard key={u.id} u={u} />)}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg z-50 transition-all"
          style={{ backgroundColor: toast.ok ? '#4a7c00' : '#e03131' }}
        >
          {toast.msg}
        </div>
      )}

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Nouvel utilisateur</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: 'Nom', key: 'name', type: 'text', placeholder: 'Prénom Nom' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'prenom@eness.fr' },
                { label: 'Mot de passe', key: 'password', type: 'password', placeholder: 'Min. 8 caractères' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label} <span className="text-red-500">*</span></label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100]"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100]"
                >
                  <option value="commercial">Commercial</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={createUser}
                disabled={!form.name || !form.email || form.password.length < 8}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-lg disabled:bg-gray-300"
                style={{ backgroundColor: '#6bb100' }}
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reset MDP */}
      {showReset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Reset — {showReset.name}</h3>
              <button onClick={() => setShowReset(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            <div className="px-5 py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-3">
                ⚠️ À utiliser uniquement en cas de besoin. Communiquez le nouveau mot de passe à l'utilisateur.
              </div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nouveau mot de passe <span className="text-red-500">*</span></label>
              <input
                type="password"
                placeholder="Min. 8 caractères"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#6bb100]"
              />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setShowReset(null)} className="flex-1 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={resetPassword}
                disabled={newPassword.length < 8}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-lg disabled:bg-gray-300"
                style={{ backgroundColor: '#6bb100' }}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}