/**
 * Background Service Worker
 * Manages tab-specific Side Panel visibility (enabled only on hrm.mindx.edu.vn and localhost).
 */

const TARGET_DOMAIN = 'hrm.mindx.edu.vn';

// Disable the side panel globally by default so it does not appear on random sites
chrome.sidePanel
  .setOptions({ enabled: false })
  .catch(console.error);

// Enable opening side panel when clicking the action icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Helper function to update panel state based on tab URL
async function updatePanelState(tabId: number, urlString?: string) {
  if (!urlString) {
    await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
    return;
  }

  try {
    const url = new URL(urlString);
    const isTarget = 
      url.hostname === TARGET_DOMAIN || 
      url.hostname === 'localhost' || 
      url.hostname === '127.0.0.1';

    if (isTarget) {
      await chrome.sidePanel.setOptions({
        tabId,
        path: 'src/sidepanel/index.html',
        enabled: true
      });
    } else {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: false
      });
    }
  } catch (e) {
    // For non-standard URLs like chrome://, chrome-extension://, etc.
    await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  }
}

// 1. Listen for URL updates on tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    void updatePanelState(tabId, tab.url);
  }
});

// 2. Listen for tab switches (Activation)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.id) {
      void updatePanelState(tab.id, tab.url);
    }
  });
});

// 3. Initialize all existing tabs on extension startup/load
chrome.tabs.query({}, (tabs) => {
  for (const tab of tabs) {
    if (tab.id) {
      void updatePanelState(tab.id, tab.url);
    }
  }
});
