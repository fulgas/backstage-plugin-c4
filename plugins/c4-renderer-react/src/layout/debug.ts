/**
 * ELK layout debug logger.
 *
 * Enable in browser console:  localStorage.setItem('c4.elkDebug', 'true'); location.reload()
 * Disable:                     localStorage.removeItem('c4.elkDebug'); location.reload()
 *
 * In Playwright tests, set window.__C4_ELK_DEBUG__ = true via addInitScript before page load.
 * Capture with: page.on('console', msg => { if (msg.text().startsWith('[c4-elk]')) ... })
 */

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as Record<string, unknown>).__C4_ELK_DEBUG__ === true)
    return true;
  try {
    return localStorage.getItem('c4.elkDebug') === 'true';
  } catch {
    return false;
  }
}

// eslint-disable-next-line no-console
export function elkDebug(msg: string, data?: unknown): void {
  if (!isDebugEnabled()) return;
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console.debug('[c4-elk]', msg, data);
  } else {
    // eslint-disable-next-line no-console
    console.debug('[c4-elk]', msg);
  }
}
