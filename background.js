chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ apps: [] }, (data) => {
    if (!Array.isArray(data.apps)) {
      chrome.storage.local.set({ apps: [] });
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
