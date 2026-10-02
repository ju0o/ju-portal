import { chromium } from '@playwright/test';

/**
 * Browser access helper.
 *
 * Chromium cannot launch inside this container (libnspr4/libnss3/libasound2 are
 * missing and sudo is unavailable). A Windows-side Chrome is used over CDP and
 * published into WSL through a TCP relay.
 *
 * JU_CDP_ENDPOINT=http://<windows-host>:9224  -> connect over CDP
 * unset                                         -> launch local chromium normally
 *
 * Over CDP there is only ONE default browser context; newContext() is not
 * available, so callers share it and isolate state with fresh pages.
 */
export function cdpEndpoint() {
  return process.env.JU_CDP_ENDPOINT || undefined;
}

export async function launchBrowser(options = {}) {
  const endpoint = cdpEndpoint();

  if (endpoint) {
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 60_000 });
    const context = browser.contexts()[0] ?? (await browser.newContext());
    return { browser, context, cdp: true };
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'], ...options.launchOptions });
  const context = await browser.newContext(options.contextOptions);
  return { browser, context, cdp: false };
}