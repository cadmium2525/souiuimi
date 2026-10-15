import './ui/pwa.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Install/update actions are confined to the title screen, away from a case. */
export function installPWA(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (new URLSearchParams(location.search).has('qa')) return;
  const root = document.querySelector<HTMLElement>('#ui');
  if (!root) return;

  const tools = document.createElement('aside');
  tools.id = 'pwa-tools';
  tools.setAttribute('aria-label', 'アプリ');
  const update = document.createElement('button');
  update.type = 'button'; update.id = 'pwa-update-button'; update.textContent = '更新して再読み込み';
  const install = document.createElement('button');
  install.type = 'button'; install.id = 'pwa-install-button'; install.textContent = 'アプリを入れる';
  tools.append(update, install);
  document.body.append(tools);
  let prompt: InstallPromptEvent | null = null;
  let waiting: ServiceWorker | null = null;
  let updateRequested = false;
  let reloaded = false;
  let isInstalled = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const refresh = () => {
    update.hidden = !waiting;
    install.hidden = !!waiting || !prompt || isInstalled;
    tools.hidden = root.dataset.phase !== 'title' || (update.hidden && install.hidden);
    document.body.classList.toggle('has-pwa-action', !tools.hidden);
  };
  new MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ['data-phase'] });
  refresh();

  // Version queries let the worker preserve assets belonging to other open tabs.
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PWA_VERSION_QUERY') {
      const assets = [entry, ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'), (link) => link.href)]
        .filter((asset): asset is string => typeof asset === 'string');
      event.ports[0]?.postMessage({ entry, assets });
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested && !reloaded) { reloaded = true; location.reload(); }
    else { waiting = null; refresh(); navigator.serviceWorker.controller?.postMessage({ type: 'CLIENT_READY' }); }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); prompt = event as InstallPromptEvent; refresh();
  });
  window.addEventListener('appinstalled', () => { isInstalled = true; prompt = null; refresh(); });
  install.addEventListener('click', async () => {
    const current = prompt;
    if (!current) return;
    prompt = null; refresh();
    try { await current.prompt(); await current.userChoice; }
    catch { /* The browser may withdraw an installation offer. */ }
  });
  update.addEventListener('click', () => {
    if (!waiting || root.dataset.phase !== 'title') return;
    updateRequested = true; update.disabled = true; update.textContent = '更新中…';
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname, updateViaCache: 'none' })
    .then((registration) => {
      const offerUpdate = () => {
        waiting = navigator.serviceWorker.controller ? registration.waiting : null;
        refresh();
      };
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
      });
      void navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller?.postMessage({ type: 'CLIENT_READY' }));
      // Check on return to the title after a backgrounded session, without reload.
      let lastCheck = 0;
      const check = () => {
        if (document.hidden || !navigator.onLine || Date.now() - lastCheck < 60_000) return;
        lastCheck = Date.now(); void registration.update().catch(() => {});
      };
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', check);
      check();
    })
    .catch((error: unknown) => { console.warn('アプリのオフライン準備を保留しました。', error); });
}
