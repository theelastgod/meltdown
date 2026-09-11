/**
 * Installability (Stage 45): register the service worker, in the built site only.
 *
 * Dev is excluded on purpose. A worker that caches the dev server's modules would hand a probe a
 * stale build with nothing in its output to say so, and every probe runs against dev. `npm run
 * smoke` runs against the built preview and is where registration is asserted.
 */
export interface PwaState {
  supported: boolean;
  registered: boolean;
  controlled: boolean;
  scope: string | null;
}

let registered = false;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then(() => {
      registered = true;
    })
    .catch(() => {
      /* offline install is a nicety; the game is not */
    });
}

export async function pwaState(): Promise<PwaState> {
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  if (!supported) return { supported, registered: false, controlled: false, scope: null };
  const reg = await navigator.serviceWorker.getRegistration();
  return { supported, registered: registered || !!reg, controlled: !!navigator.serviceWorker.controller, scope: reg?.scope ?? null };
}
