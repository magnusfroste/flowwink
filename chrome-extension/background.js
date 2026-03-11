// Background service worker
// Handles keyboard shortcuts, extension lifecycle, and page-settle scraping

chrome.runtime.onInstalled.addListener(() => {
  console.log("Signal Capture extension installed");
});

// Handle keyboard command
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-palette") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "toggle_palette" });
      }
    });
  }
});

// Handle messages from content scripts or external sources
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
  }
  return true;
});

// ---- Page Settle Detection ----
// Instead of a fixed timeout, we watch for network inactivity
// to know when an SPA has finished loading dynamic content.
function waitForPageSettle(tabId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settleTimer = null;
    let resolved = false;
    const SETTLE_DELAY = 2000; // 2s of network quiet = settled

    function done() {
      if (resolved) return;
      resolved = true;
      chrome.webNavigation?.onCompleted?.removeListener(navListener);
      clearTimeout(hardTimeout);
      resolve();
    }

    // Reset settle timer on any navigation event in the tab
    function navListener(details) {
      if (details.tabId === tabId) {
        resetSettle();
      }
    }

    function resetSettle() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(done, SETTLE_DELAY);
    }

    // Listen for sub-frame loads (SPA route changes, lazy content)
    chrome.webNavigation?.onCompleted?.addListener(navListener);

    // Hard timeout fallback
    const hardTimeout = setTimeout(done, timeoutMs);

    // Start the settle clock
    resetSettle();
  });
}

// Handle external messages (from admin panels via externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  if (message.type === "scrape_active_tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "scrape_page" }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, error: "No active tab" });
      }
    });
    return true;
  }

  if (message.type === "navigate_and_scrape") {
    const url = message.url;
    if (!url) {
      sendResponse({ success: false, error: "URL required" });
      return true;
    }

    chrome.tabs.create({ url, active: true }, (tab) => {
      const tabId = tab.id;

      // Wait for initial page load
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);

          // Wait for SPA content to settle before scraping
          waitForPageSettle(tabId).then(() => {
            chrome.tabs.sendMessage(tabId, { type: "scrape_page" }, (response) => {
              chrome.tabs.remove(tabId);
              sendResponse(response || { success: false, error: "No response from content script" });
            });
          });
        }
      });
    });
    return true;
  }

  return true;
});
