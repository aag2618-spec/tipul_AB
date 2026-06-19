// v4 (2026-06-19): תיקון "ספינר תקוע אחרי פריסה".
// השינוי המרכזי: בקשות ניווט (HTML) עוברות ל-network-first במקום cache-first.
// בעבר ה-SW הגיש HTML ישן מה-cache שהצביע על chunks של build קודם — אחרי
// פריסה ה-chunks האלה נמחקים מהשרת, טעינת ה-JS נכשלת, והדף נתקע על ספינר.
// network-first מבטיח שה-HTML תמיד טרי ומצביע על ה-chunks הנוכחיים.
// בנוסף: API לא נשמר ב-cache (PHI לא נשאר בדפדפן אחרי התנתקות), ודפי HTML
// (שעלולים להכיל PHI) כבר לא נשמרים ב-cache כלל.
const CACHE_NAME = 'tipul-v4';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install — נכסים סטטיים בלבד (לא דפי HTML עם PHI).
// '/' ו-'/dashboard' הוסרו: ניווט הוא עכשיו network-first, ו-/dashboard מכיל PHI.
const CACHE_ASSETS = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // API: network-only — never cache PHI responses
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ניווט (מסמכי HTML): network-first. תמיד מביא HTML טרי שמצביע על ה-chunks
  // הנוכחיים — מונע את באג ה"ספינר התקוע" אחרי פריסה. לא נשמר ב-cache (גם
  // למניעת השארת PHI בדפדפן). נפילה לדף offline רק אם הרשת נכשלה לגמרי.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // RSC — ניווט "רך" של Next App Router (לחיצה על קישור) שולח fetch עם header
  // RSC ו-?_rsc=. אלה *לא* mode:'navigate', אז בלי הטיפול הזה הם היו נופלים
  // ל-cache-first ומגישים מטען ישן אחרי פריסה (אותו באג, בניווט רך) + שומרים
  // PHI ב-cache. network-only פותר את שניהם — תמיד טרי, אף פעם לא נשמר.
  if (
    event.request.headers.get('RSC') === '1' ||
    new URL(event.request.url).searchParams.has('_rsc')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // נכסים סטטיים (chunks עם hash, אייקונים) — cache first, network fallback.
  // ה-chunks הם immutable (שם הקובץ מכיל hash) אז cache-first בטוח להם.
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // נכס סטטי שלא ב-cache ואין רשת — אין מה להחזיר (ניווט מטופל למעלה).
          return undefined;
        });
    })
  );
});

// Logout — clear all caches so PHI pages don't persist on shared devices
self.addEventListener('message', (event) => {
  if (event.data?.type === 'LOGOUT') {
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(names.map((name) => caches.delete(name)))
      )
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Implement background sync logic here
  console.log('Background sync triggered');
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'Tipul';
  const options = {
    body: data.body || 'יש לך עדכון חדש',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    vibrate: [200, 100, 200],
    data: data.data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/dashboard')
  );
});
