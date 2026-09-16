import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { offlineStorage } from '../utils/offlineStorage';

const API_PATH = '/api/v1';
const CUSTOM_APP_URL_KEY = 'custom_app_url';

export const normalizeApplicationUrl = (value?: string | null) => {
  let raw = (value || '').trim();
  if (!raw) return '';

  if (!/^https?:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    return url.origin;
  } catch {
    return '';
  }
};

export const applicationUrlToApiBaseUrl = (value?: string | null) => {
  const applicationUrl = normalizeApplicationUrl(value);
  return applicationUrl ? `${applicationUrl}${API_PATH}` : '';
};

export const IS_NATIVE_APP = Capacitor.isNativePlatform();
export const CONFIGURED_APPLICATION_URL = typeof window !== 'undefined'
  ? IS_NATIVE_APP
    ? normalizeApplicationUrl(localStorage.getItem(CUSTOM_APP_URL_KEY))
    : ''
  : '';

const getApiBaseUrl = () => {
  if (CONFIGURED_APPLICATION_URL) {
    return `${CONFIGURED_APPLICATION_URL}${API_PATH}`;
  }

  const configuredUrl = import.meta.env.VITE_API_URL;
  if (configuredUrl) {
    if (configuredUrl.startsWith('/')) return configuredUrl;

    // In a Docker/Nginx web deployment, keep API calls on the same origin.
    // This avoids baking a VM IP into the browser bundle and lets the proxy
    // route requests to the API container, even when the VM address changes.
    if (!IS_NATIVE_APP && !['3000', '5173'].includes(window.location.port)) {
      return API_PATH;
    }

    return applicationUrlToApiBaseUrl(configuredUrl);
  }

  const { hostname, port, protocol } = window.location;

  // Native login is blocked until the application address is configured.
  if (IS_NATIVE_APP) {
    return API_PATH;
  }

  // Native Vite development runs on its own port and needs to reach the API directly.
  if (port === '3000' || port === '5173') {
    const apiProtocol = protocol.startsWith('http') ? protocol : 'http:';
    return `${apiProtocol}//${hostname || 'localhost'}:8080${API_PATH}`;
  }
  
  // Docker/Nginx deployment proxies /api/v1 to the API container internally.
  return API_PATH;
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, '');

export const toApiFileUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add access token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle caching, offline queueing and token expiry
apiClient.interceptors.response.use(
  (response) => {
    // Automatically cache GET responses for offline read-access
    if (response.config.method?.toLowerCase() === 'get' && response.config.url) {
      offlineStorage.setCache(response.config.url, response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || !navigator.onLine;

    // Handle offline scenario
    if (isNetworkError && originalRequest) {
      const method = (originalRequest.method || 'get').toLowerCase();
      const url = originalRequest.url || '';

      // Emergency alerts are strictly blocked offline
      if (url.includes('/alertas/alertar') || url.includes('/emergencia/alertar')) {
        return Promise.reject(new Error('Os alertas de emergência são em tempo real e exigem conexão ativa com a internet.'));
      }

      // 1. If GET, serve from offline cache if available
      if (method === 'get') {
        const cached = offlineStorage.getCache(url);
        if (cached !== null) {
          return Promise.resolve({
            data: cached,
            status: 200,
            statusText: 'OK (Offline Cache)',
            headers: {},
            config: originalRequest,
          });
        }
      }

      // 2. If mutating request (POST, PUT, DELETE, PATCH), enqueue for auto-sync
      if (['post', 'put', 'delete', 'patch'].includes(method)) {
        let payload = originalRequest.data;
        try {
          if (typeof payload === 'string') {
            payload = JSON.parse(payload);
          }
        } catch {
          // keep as is
        }

        // Determine friendly description
        let description = 'Operação em lote';
        let category: 'chamado' | 'interacao' | 'ativo' | 'movimentacao' | 'geral' = 'geral';
        if (url.includes('/servicos/chamados')) {
          description = 'Abertura/atualização de chamado';
          category = 'chamado';
        } else if (url.includes('/servicos/interacoes')) {
          description = 'Comentário em chamado';
          category = 'interacao';
        } else if (url.includes('/assets')) {
          description = 'Atualização de ativo';
          category = 'ativo';
        } else if (url.includes('/transacoes') || url.includes('/movimentacoes')) {
          description = 'Movimentação / Empréstimo';
          category = 'movimentacao';
        }

        const queueItem = offlineStorage.enqueue({
          endpoint: url,
          method: method.toUpperCase() as any,
          payload,
          description,
          category,
        });

        // Return simulated accepted response so UI continues seamlessly
        return Promise.resolve({
          data: {
            id: `temp_${Date.now()}`,
            ...payload,
            _offline_queued: true,
            _queue_id: queueItem.id,
            message: 'Ação salva localmente no dispositivo. Será sincronizada automaticamente ao restabelecer a conexão.',
          },
          status: 202,
          statusText: 'Accepted (Enqueued Offline)',
          headers: {},
          config: originalRequest,
        });
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Redirect to login if on protected page
      const publicAuthCheck = window.location.pathname === '/' && originalRequest?.url === '/auth/me';
      if (!publicAuthCheck && !['/apresentacao', '/login', '/qr-login'].includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
