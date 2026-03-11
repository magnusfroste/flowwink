// Background service worker
// Handles keyboard shortcuts and extension lifecycle

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
    return true; // Keep channel open for async response
  }

  if (message.type === "navigate_and_scrape") {
    const url = message.url;
    if (!url) {
      sendResponse({ success: false, error: "URL required" });
      return true;
    }

    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      
      // Wait for page to load
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Scrape the page
          chrome.tabs.sendMessage(tabId, { type: "scrape_page" }, (response) => {
            // Close the tab
            chrome.tabs.remove(tabId);
            sendResponse(response);
          });
        }
      });
    });
    return true; // Keep channel open for async response
  }

  return true;
});
