export async function enableBrowserNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('Browser notifications are not supported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');
  await navigator.serviceWorker.register('/notification-sw.js');
}

export async function showBrowserNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, { body, icon: '/favicon.svg', tag: `resqnet-${title}-${body}` });
}
