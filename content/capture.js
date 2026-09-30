(function () {
  if (window.__devCredsCaptureInstalled) return;
  window.__devCredsCaptureInstalled = true;

  if (!DevCreds.match.isLocalPage(location.href)) return;

  const PROMPT_ID = "dev-creds-save-prompt";
  let lastSignature = "";
  let lastShownAt = 0;

  function ensureStyles() {
    if (document.getElementById("dev-creds-styles")) return;
    const link = document.createElement("link");
    link.id = "dev-creds-styles";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/prompt.css");
    (document.head || document.documentElement).appendChild(link);
  }

  function removePrompt() {
    document.getElementById(PROMPT_ID)?.remove();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findSavedAccount(apps, hostPort, username) {
    const byHost = DevCreds.match.findAppByHostPort(apps, hostPort);
    if (byHost) {
      const acc = (byHost.accounts || []).find((a) => a.username === username);
      if (acc) return { app: byHost, account: acc };
    }
    // Also check URL-matched apps (alias patterns)
    const matched = DevCreds.match.findMatchingApps(apps, location.href);
    for (const app of matched) {
      const acc = (app.accounts || []).find((a) => a.username === username);
      if (acc) return { app, account: acc };
    }
    return null;
  }

  async function showSavePrompt({ username, password }) {
    const hostPort = DevCreds.match.hostPortFromUrl(location.href);
    if (!hostPort) return;

    const apps = await DevCreds.storage.getApps();
    const saved = findSavedAccount(apps, hostPort, username);
    // Already saved with the same password — don't ask again
    if (saved && saved.account.password === password) return;

    const signature = `${hostPort}|${username}|${password}`;
    const now = Date.now();
    if (signature === lastSignature && now - lastShownAt < 4000) return;
    lastSignature = signature;
    lastShownAt = now;

    removePrompt();
    if (typeof window.__devCredsHidePanel === "function") {
      window.__devCredsHidePanel();
    }

    ensureStyles();

    const existing = saved?.app || DevCreds.match.findAppByHostPort(apps, hostPort);
    const defaultName = existing?.name || hostPort;
    const existingAccount = saved?.account || null;

    const isUpdate = Boolean(existingAccount);
    const root = document.createElement("div");
    root.id = PROMPT_ID;
    root.innerHTML = `
      <div class="dc-body">
        <p class="dc-title">${isUpdate ? "Update saved password?" : "Save this account?"}</p>
        <p class="dc-sub">${escapeHtml(username)} · ${escapeHtml(hostPort)}</p>
        <label for="dc-app-name">App</label>
        <input id="dc-app-name" type="text" autocomplete="off" />
        <label for="dc-label">Role label</label>
        <input id="dc-label" type="text" autocomplete="off" placeholder="Admin, User, Viewer…" />
        <div class="dc-actions">
          <button type="button" class="dc-skip">Skip</button>
          <button type="button" class="dc-save">${isUpdate ? "Update" : "Save"}</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(root);

    const appInput = root.querySelector("#dc-app-name");
    const labelInput = root.querySelector("#dc-label");
    appInput.value = defaultName;
    labelInput.value = existingAccount?.label || "";
    labelInput.focus();

    root.querySelector(".dc-skip").addEventListener("click", () => {
      removePrompt();
      if (typeof window.__devCredsShowPanel === "function") {
        window.__devCredsShowPanel();
      }
    });

    root.querySelector(".dc-save").addEventListener("click", async () => {
      try {
        await DevCreds.storage.saveAccount({
          appName: appInput.value.trim() || hostPort,
          urlPattern: hostPort,
          label: labelInput.value.trim() || username,
          username,
          password,
        });
        removePrompt();
        if (typeof window.__devCredsShowPanel === "function") {
          window.__devCredsShowPanel();
        }
      } catch (err) {
        console.error("[Dev Creds] save failed", err);
      }
    });
  }

  function maybeCapture(fromEl) {
    try {
      const creds = DevCreds.fields.readCredentials(fromEl || document);
      if (!creds) return;
      showSavePrompt(creds);
    } catch (err) {
      console.error("[Dev Creds] capture failed", err);
    }
  }

  function isSubmitControl(el) {
    if (!el || !el.closest) return false;
    const btn = el.closest(
      'button, input[type="submit"], input[type="button"], [role="button"]'
    );
    if (!btn) return false;
    if (btn.matches('input[type="submit"], button[type="submit"]')) return true;
    const text = (btn.textContent || btn.value || "").toLowerCase();
    return /log\s*in|sign\s*in|submit|continue|next/.test(text);
  }

  document.addEventListener(
    "submit",
    (event) => {
      maybeCapture(event.target);
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!isSubmitControl(event.target)) return;
      setTimeout(() => maybeCapture(event.target), 0);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") return;
      const t = event.target;
      if (!t || t.tagName !== "INPUT") return;
      if (!DevCreds.fields.findPasswordInput(document)) return;
      setTimeout(() => maybeCapture(t), 0);
    },
    true
  );
})();
