// frontend/src/components/LLMSettings.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '../config';

interface LLMProvider {
  id: number;
  name: string;
  provider_type: string;
  api_key?: string;
  api_base_url?: string;
  model_name: string;
  max_tokens: number;
  temperature: string;
  is_active: boolean;
  is_default: boolean;
  api_key_set: boolean;
  created_at: string;
}

interface LLMSettingsProps {
  onClose: () => void;
}

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'] },
  { value: 'ollama', label: 'Ollama (Local)', models: ['llama2', 'codellama', 'mistral', 'mixtral'] },
  { value: 'custom', label: 'Custom / OpenAI-compatible', models: [] },
];

export const LLMSettings: React.FC<LLMSettingsProps> = ({ onClose }) => {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Új provider form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    provider_type: 'openai',
    api_key: '',
    api_base_url: '',
    model_name: 'gpt-4o-mini',
    max_tokens: 4096,
    temperature: '0.7',
  });

  // Szerkesztés
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<LLMProvider>>({});

  // Providers betöltése
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[LLM Settings] Fetching providers from:', `${BACKEND_URL}/api/llm-providers`);
      const resp = await fetch(`${BACKEND_URL}/api/llm-providers`);
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText || 'Nem sikerült betölteni'}`);
      }
      const data = await resp.json();
      console.log('[LLM Settings] Providers loaded:', data);
      setProviders(data);
    } catch (err) {
      console.error('[LLM Settings] Error:', err);
      const message = err instanceof Error ? err.message : 'Hiba történt';
      setError(`Failed to fetch - Backend: ${BACKEND_URL} - ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Provider hozzáadása
  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${BACKEND_URL}/api/llm-providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProvider),
      });
      if (!resp.ok) throw new Error('Nem sikerült létrehozni');
      
      setShowAddForm(false);
      setNewProvider({
        name: '',
        provider_type: 'openai',
        api_key: '',
        api_base_url: '',
        model_name: 'gpt-4o-mini',
        max_tokens: 4096,
        temperature: '0.7',
      });
      loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    }
  };

  // Provider aktiválása
  const handleActivate = async (id: number) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/llm-providers/${id}/activate`, {
        method: 'POST',
      });
      if (!resp.ok) throw new Error('Nem sikerült aktiválni');
      loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    }
  };

  // Provider törlése
  const handleDelete = async (id: number) => {
    if (!confirm('Biztosan törlöd ezt a provider-t?')) return;
    
    try {
      const resp = await fetch(`${BACKEND_URL}/api/llm-providers/${id}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Nem sikerült törölni');
      loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    }
  };

  // Provider frissítése
  const handleUpdate = async (id: number) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/llm-providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!resp.ok) throw new Error('Nem sikerült frissíteni');
      setEditingId(null);
      setEditForm({});
      loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hiba történt');
    }
  };

  // Szerkesztés indítása
  const startEdit = (provider: LLMProvider) => {
    setEditingId(provider.id);
    setEditForm({
      name: provider.name,
      provider_type: provider.provider_type,
      api_base_url: provider.api_base_url || '',
      model_name: provider.model_name,
      max_tokens: provider.max_tokens,
      temperature: provider.temperature,
    });
  };

  // Provider type kiválasztásakor modellek
  const getModelsForType = (type: string): string[] => {
    const providerType = PROVIDER_TYPES.find(p => p.value === type);
    return providerType?.models || [];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content llm-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🤖 LLM Beállítások</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="error-banner">{error}</div>
        )}

        <div className="llm-settings-body">
          {/* Provider lista */}
          <div className="provider-list">
            <div className="provider-list-header">
              <h3>Konfigurált LLM-ek</h3>
              <button 
                className="add-provider-btn"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? '✕ Mégse' : '+ Új LLM'}
              </button>
            </div>

            {loading ? (
              <div className="loading">Betöltés...</div>
            ) : providers.length === 0 ? (
              <div className="no-providers">
                <p>Nincs még konfigurált LLM.</p>
                <p>Kattints a "+ Új LLM" gombra egy új hozzáadásához!</p>
              </div>
            ) : (
              <div className="providers">
                {providers.map(provider => (
                  <div 
                    key={provider.id} 
                    className={`provider-card ${provider.is_active ? 'active' : ''}`}
                  >
                    {editingId === provider.id ? (
                      // Szerkesztési mód
                      <div className="provider-edit-form">
                        <input
                          type="text"
                          value={editForm.name || ''}
                          onChange={e => setEditForm({...editForm, name: e.target.value})}
                          placeholder="Név"
                        />
                        <select
                          value={editForm.provider_type || 'openai'}
                          onChange={e => setEditForm({...editForm, provider_type: e.target.value})}
                        >
                          {PROVIDER_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <input
                          type="password"
                          placeholder="Új API kulcs (opcionális)"
                          onChange={e => setEditForm({...editForm, api_key: e.target.value})}
                        />
                        <input
                          type="text"
                          value={editForm.model_name || ''}
                          onChange={e => setEditForm({...editForm, model_name: e.target.value})}
                          placeholder="Model név"
                        />
                        <div className="edit-actions">
                          <button onClick={() => handleUpdate(provider.id)}>💾 Mentés</button>
                          <button onClick={() => setEditingId(null)}>Mégse</button>
                        </div>
                      </div>
                    ) : (
                      // Megjelenítési mód
                      <>
                        <div className="provider-header">
                          <span className="provider-name">{provider.name}</span>
                          {provider.is_active && <span className="active-badge">✓ Aktív</span>}
                        </div>
                        <div className="provider-details">
                          <span className="provider-type">{provider.provider_type}</span>
                          <span className="provider-model">{provider.model_name}</span>
                          <span className={`api-key-status ${provider.api_key_set ? 'set' : 'missing'}`}>
                            {provider.api_key_set ? '🔑 Kulcs beállítva' : '⚠️ Nincs kulcs'}
                          </span>
                        </div>
                        <div className="provider-actions">
                          {!provider.is_active && (
                            <button 
                              className="activate-btn"
                              onClick={() => handleActivate(provider.id)}
                            >
                              Aktiválás
                            </button>
                          )}
                          <button 
                            className="edit-btn"
                            onClick={() => startEdit(provider)}
                          >
                            ✏️
                          </button>
                          <button 
                            className="delete-btn"
                            onClick={() => handleDelete(provider.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Új provider form */}
          {showAddForm && (
            <form className="add-provider-form" onSubmit={handleAddProvider}>
              <h3>Új LLM hozzáadása</h3>
              
              <label>
                Név
                <input
                  type="text"
                  value={newProvider.name}
                  onChange={e => setNewProvider({...newProvider, name: e.target.value})}
                  placeholder="pl. My OpenAI"
                  required
                />
              </label>

              <label>
                Szolgáltató típus
                <select
                  value={newProvider.provider_type}
                  onChange={e => {
                    const type = e.target.value;
                    const models = getModelsForType(type);
                    setNewProvider({
                      ...newProvider, 
                      provider_type: type,
                      model_name: models[0] || '',
                    });
                  }}
                >
                  {PROVIDER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <label>
                API kulcs
                <input
                  type="password"
                  value={newProvider.api_key}
                  onChange={e => setNewProvider({...newProvider, api_key: e.target.value})}
                  placeholder="sk-..."
                />
              </label>

              {(newProvider.provider_type === 'ollama' || newProvider.provider_type === 'custom') && (
                <label>
                  API Base URL
                  <input
                    type="text"
                    value={newProvider.api_base_url}
                    onChange={e => setNewProvider({...newProvider, api_base_url: e.target.value})}
                    placeholder="http://localhost:11434/v1"
                  />
                </label>
              )}

              <label>
                Model
                <input
                  type="text"
                  value={newProvider.model_name}
                  onChange={e => setNewProvider({...newProvider, model_name: e.target.value})}
                  list="model-suggestions"
                  placeholder="gpt-4o-mini"
                  required
                />
                <datalist id="model-suggestions">
                  {getModelsForType(newProvider.provider_type).map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>

              <div className="form-row">
                <label>
                  Max tokens
                  <input
                    type="number"
                    value={newProvider.max_tokens}
                    onChange={e => setNewProvider({...newProvider, max_tokens: parseInt(e.target.value)})}
                  />
                </label>
                <label>
                  Temperature
                  <input
                    type="text"
                    value={newProvider.temperature}
                    onChange={e => setNewProvider({...newProvider, temperature: e.target.value})}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  💾 Mentés
                </button>
                <button type="button" className="secondary-button" onClick={() => setShowAddForm(false)}>
                  Mégse
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default LLMSettings;



