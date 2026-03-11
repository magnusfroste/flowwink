/**
 * useExtensionRelay — Chrome Extension Relay Hook
 *
 * Enables FlowPilot's admin panel to communicate with the
 * Signal Capture Chrome Extension for browser automation.
 *
 * Like OpenClaw's Extension Relay: the agent commands the user's
 * real browser session to fetch login-walled content (LinkedIn, X, etc.)
 * without violating ToS — it's just the user browsing.
 *
 * Flow:
 * 1. Agent calls browser_fetch skill
 * 2. Edge function returns { action: 'relay_required', url }
 * 3. This hook sends navigate_and_scrape to the Chrome Extension
 * 4. Extension opens tab in user's browser, scrapes, returns content
 * 5. Hook calls browser-fetch again with relay_result
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// The extension ID — users set this in site_settings or we detect via ping
const EXTENSION_PING_TIMEOUT = 2000;

interface RelayResult {
  success: boolean;
  title?: string;
  content?: string;
  html?: string;
  url?: string;
  error?: string;
}

interface ExtensionStatus {
  installed: boolean;
  version?: string;
  extensionId?: string;
}

export function useExtensionRelay() {
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus>({ installed: false });
  const [isRelaying, setIsRelaying] = useState(false);
  const extensionIdRef = useRef<string | null>(null);

  // Try to detect the extension by sending pings to known extension IDs
  // The extension ID is set in chrome-extension/manifest.json
  // Users can configure it in site_settings
  const detectExtension = useCallback(async (knownExtensionId?: string): Promise<boolean> => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      console.log('[relay] Chrome runtime not available');
      return false;
    }

    const idsToTry = knownExtensionId ? [knownExtensionId] : [];

    // Also try to get from localStorage (user may have set it)
    const savedId = localStorage.getItem('flowwink_extension_id');
    if (savedId && !idsToTry.includes(savedId)) idsToTry.push(savedId);

    for (const id of idsToTry) {
      try {
        const result = await Promise.race([
          new Promise<any>((resolve) => {
            chrome.runtime.sendMessage(id, { type: 'ping' }, (response) => {
              if (chrome.runtime.lastError) {
                resolve(null);
              } else {
                resolve(response);
              }
            });
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), EXTENSION_PING_TIMEOUT)),
        ]);

        if (result?.installed) {
          extensionIdRef.current = id;
          setExtensionStatus({ installed: true, version: result.version, extensionId: id });
          console.log(`[relay] Extension detected: v${result.version} (${id})`);
          return true;
        }
      } catch {
        // Extension not reachable at this ID
      }
    }

    setExtensionStatus({ installed: false });
    return false;
  }, []);

  // Send a navigate_and_scrape command to the extension
  const navigateAndScrape = useCallback(async (url: string): Promise<RelayResult> => {
    const extId = extensionIdRef.current;
    if (!extId) {
      return { success: false, error: 'Extension not connected. Install the Signal Capture extension and set the extension ID.' };
    }

    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      return { success: false, error: 'Chrome runtime not available' };
    }

    setIsRelaying(true);

    try {
      const result = await new Promise<RelayResult>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Extension relay timed out (30s)' });
        }, 30000);

        chrome.runtime.sendMessage(extId, {
          type: 'navigate_and_scrape',
          url,
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'No response from extension' });
          }
        });
      });

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsRelaying(false);
    }
  }, []);

  // Scrape the currently active tab
  const scrapeActiveTab = useCallback(async (): Promise<RelayResult> => {
    const extId = extensionIdRef.current;
    if (!extId) {
      return { success: false, error: 'Extension not connected' };
    }

    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
      return { success: false, error: 'Chrome runtime not available' };
    }

    setIsRelaying(true);

    try {
      const result = await new Promise<RelayResult>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Scrape timed out (15s)' });
        }, 15000);

        chrome.runtime.sendMessage(extId, { type: 'scrape_active_tab' }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'No response' });
          }
        });
      });

      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsRelaying(false);
    }
  }, []);

  // Set extension ID manually
  const setExtensionId = useCallback((id: string) => {
    localStorage.setItem('flowwink_extension_id', id);
    extensionIdRef.current = id;
    detectExtension(id);
  }, [detectExtension]);

  return {
    extensionStatus,
    isRelaying,
    detectExtension,
    navigateAndScrape,
    scrapeActiveTab,
    setExtensionId,
  };
}
