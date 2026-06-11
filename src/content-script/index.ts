// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as Record<string, unknown>).type === 'OPEN_SIDE_PANEL'
  ) {
    // Side panel is opened by the background; content script just acknowledges
    console.log('[K-Guardian] Content script active on HRM page.')
  }
})
