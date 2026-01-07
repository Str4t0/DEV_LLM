/**
 * WebSocket Sync Hook - Real-time szinkronizáció eszközök között
 * 
 * Funkciók:
 * - Automatikus újracsatlakozás
 * - Chat üzenetek szinkronizálása
 * - Log üzenetek szinkronizálása
 * - Aktív fájl szinkronizálása
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { BACKEND_URL } from '../config';

// Backend URL WebSocket-hez (ws:// vagy wss://)
const getWsUrl = () => {
  const wsUrl = BACKEND_URL.replace(/^http/, 'ws');
  console.log(`[WS] Backend URL: ${BACKEND_URL}, WS URL: ${wsUrl}`);
  return wsUrl;
};

// WebSocket támogatás ellenőrzése (localStorage flag)
// ALAPBÓL BEKAPCSOLVA - ha nincs flag beállítva, default true
const isWebSocketEnabled = () => {
  const flag = localStorage.getItem('ws_sync_enabled');
  // Ha nincs beállítva (null), alapból be van kapcsolva
  return flag !== 'false';
};

export const setWebSocketEnabled = (enabled: boolean) => {
  localStorage.setItem('ws_sync_enabled', enabled ? 'true' : 'false');
};

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface UseWebSocketSyncProps {
  onChatMessage?: (message: ChatMessage) => void;
  onLogMessage?: (log: LogEntry) => void;
  onStateSync?: (state: any) => void;
  onFileChange?: (projectId: number, filePath: string) => void;
  enabled?: boolean;
}

interface UseWebSocketSyncReturn {
  isConnected: boolean;
  clientId: string;
  connectedClients: number;
  sendChatMessage: (message: ChatMessage, projectId?: number) => void;
  sendLogMessage: (log: LogEntry) => void;
  sendFileChange: (projectId: number, filePath: string) => void;
  joinProject: (projectId: number) => void;
  leaveProject: (projectId: number) => void;
  requestState: () => void;
  selectProject: (projectId: number | null) => void;  // Projekt váltás értesítés
}

// Egyedi kliens ID generálása (perzisztens)
const getClientId = (): string => {
  let clientId = localStorage.getItem('ws_client_id');
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('ws_client_id', clientId);
  }
  return clientId;
};

const CLIENT_ID = getClientId();

export function useWebSocketSync({
  onChatMessage,
  onLogMessage,
  onStateSync,
  onFileChange,
  enabled = true,
}: UseWebSocketSyncProps): UseWebSocketSyncReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedClients, setConnectedClients] = useState(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  
  // Callback refs - hogy ne kelljen újracsatlakozni ha változnak
  const callbacksRef = useRef({ onChatMessage, onLogMessage, onStateSync, onFileChange });
  callbacksRef.current = { onChatMessage, onLogMessage, onStateSync, onFileChange };

  // Cleanup helper
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send message helper
  const sendMessage = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        ...data,
        sender_id: CLIENT_ID,
        timestamp: new Date().toISOString(),
      }));
    }
  }, []);

  // Main connection effect
  useEffect(() => {
    mountedRef.current = true;
    
    // Ne csatlakozzunk ha nincs engedélyezve
    const wsEnabled = isWebSocketEnabled();
    console.log(`[WS] Hook init - enabled: ${enabled}, wsEnabled: ${wsEnabled}`);
    
    if (!enabled || !wsEnabled) {
      console.log('[WS] WebSocket sync kikapcsolva');
      return;
    }

    const connect = () => {
      // Ne csatlakozzunk ha már van aktív kapcsolat
      if (wsRef.current?.readyState === WebSocket.OPEN || 
          wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      const wsUrl = `${getWsUrl()}/ws/${CLIENT_ID}`;
      
      if (reconnectAttemptsRef.current === 0) {
        console.log(`[WS] Csatlakozás: ${wsUrl}`);
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          console.log('[WS] Csatlakozva - eszközök közötti szinkronizálás aktív');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;

          // Kérjük az állapotot és küldjük a historyt
          sendMessage({ type: 'request_state', data: {} });
          
          try {
            const localHistory = localStorage.getItem('chat_history');
            if (localHistory) {
              const messages = JSON.parse(localHistory);
              if (messages.length > 0) {
                sendMessage({ 
                  type: 'sync_history', 
                  data: { chat_messages: messages.slice(-50) }
                });
              }
            }
          } catch (e) { /* ignore */ }

          // Ping interval
          pingIntervalRef.current = setInterval(() => {
            sendMessage({ type: 'ping', data: {} });
          }, 30000);
        };

        ws.onclose = (event) => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // Újracsatlakozás - mobilon is működjön!
          // Növelt retry limit (10) és rövidebb kezdő delay mobilon
          const maxRetries = 10;
          if (reconnectAttemptsRef.current < maxRetries) {
            // Mobilon rövidebb delay az első néhány próbálkozásnál
            const baseDelay = reconnectAttemptsRef.current < 3 ? 500 : 1000;
            const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
            
            if (reconnectAttemptsRef.current < 5) {
              console.log(`[WS] Újracsatlakozás ${Math.round(delay/1000)}s múlva... (${reconnectAttemptsRef.current + 1}/${maxRetries})`);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              connect();
            }, delay);
          } else {
            console.warn('[WS] Max újracsatlakozási próbálkozások elérve. Frissítsd az oldalt.');
          }
        };

        ws.onerror = () => {
          if (reconnectAttemptsRef.current === 0) {
            console.warn('[WS] Kapcsolódási hiba');
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.sender_id === CLIENT_ID) return;

            const { onChatMessage, onLogMessage, onStateSync, onFileChange } = callbacksRef.current;

            switch (message.type) {
              case 'chat':
                onChatMessage?.(message.data);
                break;
              case 'log':
                onLogMessage?.(message.data);
                break;
              case 'state_sync':
                if (message.data.connected_clients !== undefined) {
                  setConnectedClients(message.data.connected_clients);
                }
                onStateSync?.(message.data);
                break;
              case 'file_change':
                if (message.data.active_project_id && message.data.active_file_path) {
                  onFileChange?.(message.data.active_project_id, message.data.active_file_path);
                }
                break;
            }
          } catch (e) {
            console.error('[WS] Üzenet hiba:', e);
          }
        };
      } catch (e) {
        console.error('[WS] Kapcsolódási hiba:', e);
      }
    };

    // Kis késleltetés a mount után
    const timer = setTimeout(connect, 200);

    // Visibility change kezelés - mobilon újracsatlakozás ha az app előtérbe kerül
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Ha az oldal látható és nincs kapcsolat, próbáljunk újracsatlakozni
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.log('[WS] Oldal előtérbe került - újracsatlakozás...');
          reconnectAttemptsRef.current = 0; // Reset retry counter
          connect();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Online/Offline eseménykezelés
    const handleOnline = () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.log('[WS] Hálózat elérhető - újracsatlakozás...');
        reconnectAttemptsRef.current = 0;
        connect();
      }
    };
    
    window.addEventListener('online', handleOnline);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      // Inline cleanup - nem függünk a cleanup callback-től
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // Csak 'enabled'-re figyelünk!

  // Publikus metódusok
  const sendChatMessage = useCallback((message: ChatMessage, projectId?: number) => {
    sendMessage({ type: 'chat', data: message, project_id: projectId });
  }, [sendMessage]);

  const sendLogMessage = useCallback((log: LogEntry) => {
    sendMessage({ type: 'log', data: log });
  }, [sendMessage]);

  const sendFileChange = useCallback((projectId: number, filePath: string) => {
    sendMessage({ type: 'file_change', data: { active_project_id: projectId, active_file_path: filePath }, project_id: projectId });
  }, [sendMessage]);

  const joinProject = useCallback((projectId: number) => {
    sendMessage({ type: 'join_project', data: {}, project_id: projectId });
  }, [sendMessage]);

  const leaveProject = useCallback((projectId: number) => {
    sendMessage({ type: 'leave_project', data: {}, project_id: projectId });
  }, [sendMessage]);

  const requestState = useCallback(() => {
    sendMessage({ type: 'request_state', data: {} });
  }, [sendMessage]);

  // Projekt váltás értesítés - a server per-client projekteket kezel
  const selectProject = useCallback((projectId: number | null) => {
    console.log(`[WS] Projekt váltás: ${projectId}`);
    sendMessage({ type: 'select_project', project_id: projectId, data: {} });
  }, [sendMessage]);

  return {
    isConnected,
    clientId: CLIENT_ID,
    connectedClients,
    sendChatMessage,
    sendLogMessage,
    sendFileChange,
    joinProject,
    leaveProject,
    requestState,
    selectProject,
  };
}
