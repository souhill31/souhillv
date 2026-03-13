const CACHE = 'souhill-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cls){
      if(cls.length > 0){
        cls[0].focus();
        cls[0].postMessage({type:'prayer_overlay', prayer: e.notification.data && e.notification.data.prayer});
      } else {
        clients.openWindow('./');
      }
    })
  );
});

self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SCHEDULE_PRAYERS'){
    storePrayers(e.data.prayers);
  }
  if(e.data && e.data.type === 'CHECK_PRAYERS'){
    backgroundPrayerCheck();
  }
});

self.addEventListener('periodicsync', e => {
  if(e.tag === 'prayer-check') e.waitUntil(backgroundPrayerCheck());
});

self.addEventListener('sync', e => {
  if(e.tag === 'prayer-check') e.waitUntil(backgroundPrayerCheck());
});

async function storePrayers(prayers){
  const cache = await caches.open('souhill-data');
  await cache.put('prayer-data', new Response(JSON.stringify({prayers, stored: Date.now()})));
}

async function backgroundPrayerCheck(){
  try {
    const cache = await caches.open('souhill-data');
    const resp = await cache.match('prayer-data');
    if(!resp) return;
    const data = JSON.parse(await resp.text());
    const nc = await caches.open('souhill-notified');
    const nr = await nc.match('last-notified');
    const lastNotified = nr ? await nr.text() : '';
    await checkAndNotify(data.prayers, lastNotified, nc);
  } catch(err){}
}

async function checkAndNotify(prayers, lastNotified, nc){
  if(!prayers) return;
  const names = ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  const now = new Date();
  const todayKey = now.toDateString();
  for(const name of names){
    const time = prayers[name];
    if(!time) continue;
    const [h,m] = time.split(':').map(Number);
    const pDate = new Date(); pDate.setHours(h,m,0,0);
    const diffMin = (now - pDate) / 60000;
    if(diffMin >= 0 && diffMin < 2){
      const key = name+'_'+todayKey;
      if(lastNotified === key) continue;
      if(nc) await nc.put('last-notified', new Response(key));
      await self.registration.showNotification('🕌 '+name+' — Heure de la prière', {
        body: 'Va faire ta prière avant de retoucher à ton téléphone.',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'prayer-'+name,
        renotify: true,
        requireInteraction: true,
        vibrate: [300,100,300,100,300],
        data: {prayer: name}
      });
      const cls = await clients.matchAll({type:'window', includeUncontrolled:true});
      for(const cl of cls) cl.postMessage({type:'prayer_overlay', prayer: name});
    }
  }
}
