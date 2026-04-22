import { type Fragment, type Connection } from './supabase';
import { type SynthesisResult } from '../services/geminiService';

const STORAGE_KEYS = {
  FRAGMENTS: 'drift_fragments',
  CONNECTIONS: 'drift_connections',
  ENTERED: 'drift_has_entered',
  SYNTHESES: 'drift_syntheses'
};

export const storage = {
  getFragments: (): Fragment[] => {
    const data = localStorage.getItem(STORAGE_KEYS.FRAGMENTS);
    return data ? JSON.parse(data) : [];
  },

  saveFragment: (fragment: Fragment): void => {
    const fragments = storage.getFragments();
    localStorage.setItem(STORAGE_KEYS.FRAGMENTS, JSON.stringify([...fragments, fragment]));
  },

  updateFragment: (id: string, updates: Partial<Fragment>): void => {
    const fragments = storage.getFragments();
    const updated = fragments.map(f => f.id === id ? { ...f, ...updates } : f);
    localStorage.setItem(STORAGE_KEYS.FRAGMENTS, JSON.stringify(updated));
  },

  getConnections: (): Connection[] => {
    const data = localStorage.getItem(STORAGE_KEYS.CONNECTIONS);
    return data ? JSON.parse(data) : [];
  },

  saveConnection: (connection: Connection): void => {
    const connections = storage.getConnections();
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify([...connections, connection]));
  },

  deleteFragment: (id: string): void => {
    const fragments = storage.getFragments();
    const connections = storage.getConnections();
    
    // Remove fragment
    const updatedFragments = fragments.filter(f => f.id !== id);
    localStorage.setItem(STORAGE_KEYS.FRAGMENTS, JSON.stringify(updatedFragments));
    
    // Remove associated connections
    const updatedConnections = connections.filter(c => c.fragment_a_id !== id && c.fragment_b_id !== id);
    localStorage.setItem(STORAGE_KEYS.CONNECTIONS, JSON.stringify(updatedConnections));
  },

  getSyntheses: (): (SynthesisResult & { created_at: string, id: string })[] => {
    const data = localStorage.getItem(STORAGE_KEYS.SYNTHESES);
    return data ? JSON.parse(data) : [];
  },

  saveSynthesis: (synthesis: SynthesisResult): void => {
    const syntheses = storage.getSyntheses();
    const newSynthesis = {
      ...synthesis,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.SYNTHESES, JSON.stringify([newSynthesis, ...syntheses]));
  },

  hasEntered: (): boolean => {
    return localStorage.getItem(STORAGE_KEYS.ENTERED) === 'true';
  },

  setEntered: (val: boolean): void => {
    localStorage.setItem(STORAGE_KEYS.ENTERED, String(val));
  }
};
