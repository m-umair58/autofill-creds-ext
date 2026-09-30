(function () {
  if (window.__devCredsFillInstalled) return;
  window.__devCredsFillInstalled = true;

  if (!DevCreds.match.isLocalPage(location.href)) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING_FILL") {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type !== "FILL_CREDENTIALS") return false;
    try {
      const result = DevCreds.fields.fillCredentials(
        message.username || "",
        message.password || ""
      );
      sendResponse(result);
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
    return true;
  });
})();
