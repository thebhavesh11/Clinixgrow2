'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API, safeFetch } from './utils';

const ClientContext = createContext(null);

export function ClientProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileMode, setProfileMode] = useState(true); // Netflix-style: start with profile selector

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    const [data] = await safeFetch(`${API}/clients`);
    const list = Array.isArray(data) ? data : [];
    setClients(list);

    // Check localStorage for previously selected client
    const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedClientId') : null;
    if (stored && list.some(c => c.id === parseInt(stored))) {
      setSelectedClientId(parseInt(stored));
      // Don't auto-enter profile — still show selector on fresh load
    } else if (list.length > 0) {
      setSelectedClientId(list[0].id);
    }
    setLoading(false);
  }

  function selectClient(id) {
    setSelectedClientId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedClientId', String(id));
    }
  }

  // Enter a client's workspace (from profile selector)
  function enterClient(id) {
    selectClient(id);
    setProfileMode(false);
  }

  // Go back to profile selector (like Netflix "Switch Profile")
  function switchProfile() {
    setProfileMode(true);
  }

  // Build API URL with business_id appended
  const bUrl = useCallback((path) => {
    if (!selectedClientId) return `${API}${path}`;
    const sep = path.includes('?') ? '&' : '?';
    return `${API}${path}${sep}business_id=${selectedClientId}`;
  }, [selectedClientId]);

  const selectedClient = clients.find(c => c.id === selectedClientId) || null;

  return (
    <ClientContext.Provider value={{
      clients,
      selectedClientId,
      selectedClient,
      selectClient,
      enterClient,
      switchProfile,
      profileMode,
      loadClients,
      bUrl,
      loading,
    }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used within ClientProvider');
  return ctx;
}
