import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'assettrack-alertas';
const SOUND_FILE = 'notificacao_alerta.mp3';
let initialized = false;

const NOTIFIED_CACHE_KEY = 'assettrack_android_notified_keys';
const notifiedKeys = new Set<string>();

// Hydrate deduplication cache from sessionStorage
try {
  const stored = sessionStorage.getItem(NOTIFIED_CACHE_KEY);
  if (stored) {
    const list = JSON.parse(stored);
    if (Array.isArray(list)) {
      list.forEach((k: string) => notifiedKeys.add(k));
    }
  }
} catch {
  // Ignore sessionStorage errors
}

const saveNotifiedKey = (key: string) => {
  notifiedKeys.add(key);
  try {
    // Keep up to 300 recent keys
    const items = Array.from(notifiedKeys).slice(-300);
    sessionStorage.setItem(NOTIFIED_CACHE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota
  }
};

export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const initializeAndroidNotifications = async () => {
  if (!isAndroidApp() || initialized) return;
  initialized = true;

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Alertas do AssetTrack TI',
      description: 'Alertas emergenciais e novidades operacionais do AssetTrack TI',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#ef4444',
      sound: SOUND_FILE,
    });

    const permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  } catch (error) {
    initialized = false;
    console.warn('[ANDROID_NOTIFICATIONS] Permission/channel setup failed:', error);
  }
};

export const notifyAndroid = async (
  title: string,
  body: string,
  extra?: Record<string, unknown>,
  dedupeKey?: string
) => {
  if (!isAndroidApp()) return;

  // Deduplication check: prevent same notification from being fired repeatedly across components/polls
  const key = dedupeKey || `${title}:${body}`;
  if (notifiedKeys.has(key)) {
    return;
  }
  saveNotifiedKey(key);

  try {
    const permissions = await LocalNotifications.checkPermissions();
    if (permissions.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title,
          body,
          channelId: CHANNEL_ID,
          sound: SOUND_FILE,
          smallIcon: 'ic_launcher',
          extra,
        },
      ],
    });
  } catch (error) {
    console.warn('[ANDROID_NOTIFICATIONS] Notification failed:', error);
  }
};
