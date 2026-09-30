/**
 * Auto panel: appears on local-dev login pages when a password field is present.
 * Sticky dismiss (×) until chip click or tab reload. Alt+1/2/3 fills accounts.
 */
(function () {
  if (window.__devCredsPanelInstalled) return;
  window.__devCredsPanelInstalled = true;

  if (!DevCreds.match.isLocalPage(location.href)) return;

  const PANEL_ID = "dev-creds-autofill-panel";
  const DISMISS_KEY = "devCredsPanelDismissed";
  let expanded = true;
  let lastAccountSig = "";
  let repositionTimer = null;
  let cachedAccounts = [];

  function ensureStyles() {
    if (document.getElementById("dev-creds-styles")) return;
    const link = document.createElement("link");
    link.id = "dev-creds-styles";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("content/prompt.css");
    (document.head || document.documentElement).appendChild(link);
  }

  function escaped(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isDismissed() {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setDismissed(value) {
    try {
      if (value) sessionStorage.setItem(DISMISS_KEY, "1");
      else sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }

  function removePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function positionNearPassword(panel) {
    const pwd = DevCreds.fields.findPasswordInput(document);
    if (!pwd) {
      panel.classList.add("dc-dock-br");
      panel.style.top = "";
      panel.style.left = "";
      return;
    }
    const rect = pwd.getBoundingClientRect();
    const panelW = 300;
    const gap = 10;
    let top = rect.bottom + gap;
    let left = rect.left;

    if (left + panelW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelW - 12);
    }
    if (top + 220 > window.innerHeight) {
      top = Math.max(12, rect.top - gap - (panel.offsetHeight || 180));
    }
    if (top < 12) top = 12;

    panel.classList.remove("dc-dock-br");
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  async function resolveAccounts() {
    const apps = await DevCreds.storage.getApps();
    const matched = DevCreds.match.findMatchingApps(apps, location.href);
    if (matched.length === 1) {
      return { app: matched[0], accounts: matched[0].accounts || [] };
    }
    if (matched.length > 1) {
      const accounts = matched.flatMap((app) =>
        (app.accounts || []).map((a) => ({ ...a, _appName: app.name }))
      );
      return { app: null, accounts, multi: true };
    }
    return { app: null, accounts: [] };
  }

  function fillByIndex(index) {
    const account = cachedAccounts[index];
    if (!account) return false;
    const result = DevCreds.fields.fillCredentials(
      account.username,
      account.password
    );
    if (!result.ok) return false;
    const root = document.getElementById(PANEL_ID);
    if (root) {
      root.classList.add("dc-flash-ok");
      setTimeout(() => root.classList.remove("dc-flash-ok"), 500);
    }
    // After fill, collapse but keep chip visible (not full dismiss)
    expanded = false;
    setTimeout(() => refreshPanel(true), 400);
    return true;
  }

  function renderCollapsed(root, count, appName) {
    root.classList.add("dc-collapsed");
    root.classList.remove("dc-expanded");
    root.innerHTML = `
      <button type="button" class="dc-chip" aria-expanded="false">
        <span class="dc-mark" aria-hidden="true"></span>
        <span class="dc-chip-text">
          <span class="dc-chip-title">Dev Creds</span>
          <span class="dc-chip-meta">${escaped(appName || "accounts")} · ${count}</span>
        </span>
      </button>
    `;
    root.querySelector(".dc-chip").addEventListener("click", () => {
      setDismissed(false);
      expanded = true;
      refreshPanel(true);
    });
  }

  function renderExpanded(root, { app, accounts, multi }) {
    root.classList.remove("dc-collapsed");
    root.classList.add("dc-expanded");

    const title = multi ? "Pick an account" : app?.name || "Dev Creds";
    const host = DevCreds.match.hostPortFromUrl(location.href) || "";

    root.innerHTML = `
      <div class="dc-panel-head">
        <div class="dc-panel-brand">
          <span class="dc-mark" aria-hidden="true"></span>
          <div>
            <div class="dc-panel-title">${escaped(title)}</div>
            <div class="dc-panel-sub">${escaped(host)} · Alt+1…</div>
          </div>
        </div>
        <div class="dc-panel-tools">
          <button type="button" class="dc-icon-btn dc-minify" title="Minimize" aria-label="Minimize">–</button>
          <button type="button" class="dc-icon-btn dc-close" title="Dismiss until chip or reload" aria-label="Dismiss">×</button>
        </div>
      </div>
      <div class="dc-account-list" role="list"></div>
    `;

    const list = root.querySelector(".dc-account-list");
    accounts.forEach((account, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dc-account";
      btn.setAttribute("role", "listitem");
      const sub = account._appName
        ? `${account._appName} · ${account.username}`
        : account.username;
      const shortcut =
        index < 9
          ? `<span class="dc-kbd" title="Alt+${index + 1}">${index + 1}</span>`
          : "";
      btn.innerHTML = `
        <span class="dc-role">${escaped(account.label)}</span>
        <span class="dc-user">${escaped(sub)}</span>
        <span class="dc-fill-meta">
          ${shortcut}
          <span class="dc-fill-hint">Fill</span>
        </span>
      `;
      btn.addEventListener("click", () => fillByIndex(index));
      list.appendChild(btn);
    });

    root.querySelector(".dc-minify").addEventListener("click", () => {
      expanded = false;
      refreshPanel(true);
    });
    root.querySelector(".dc-close").addEventListener("click", () => {
      // Sticky dismiss: stay collapsed as chip until chip click or reload
      setDismissed(true);
      expanded = false;
      refreshPanel(true);
    });
  }

  async function refreshPanel(force) {
    if (document.getElementById("dev-creds-save-prompt")) {
      removePanel();
      return;
    }

    const pwd = DevCreds.fields.findPasswordInput(document);
    if (!pwd) {
      removePanel();
      return;
    }

    const data = await resolveAccounts();
    cachedAccounts = data.accounts || [];
    if (!cachedAccounts.length) {
      removePanel();
      return;
    }

    ensureStyles();

    // Sticky dismiss: show chip only, never auto-expand
    if (isDismissed()) {
      expanded = false;
    }

    const sig = cachedAccounts.map((a) => a.id).join(",");
    let root = document.getElementById(PANEL_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = PANEL_ID;
      root.setAttribute("data-dev-creds", "panel");
      document.documentElement.appendChild(root);
      force = true;
    }

    const mode = expanded ? "open" : "chip";
    if (force || sig !== lastAccountSig || root.dataset.mode !== mode) {
      lastAccountSig = sig;
      root.dataset.mode = mode;
      if (expanded) {
        renderExpanded(root, data);
      } else {
        renderCollapsed(
          root,
          cachedAccounts.length,
          data.app?.name || (data.multi ? "Multiple apps" : "Dev Creds")
        );
      }
    }

    requestAnimationFrame(() => positionNearPassword(root));
  }

  function scheduleRefresh() {
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => refreshPanel(false), 120);
  }

  function onFocusIn(event) {
    const t = event.target;
    if (!t || t.tagName !== "INPUT") return;
    const type = (t.type || "").toLowerCase();
    if (!["password", "email", "text", "tel"].includes(type)) return;
    if (!DevCreds.fields.findPasswordInput(document)) return;
    // Do NOT clear sticky dismiss on focus — only chip / reload reopens
    if (isDismissed()) {
      // Keep chip visible / refreshed, do not expand
      refreshPanel(false);
      return;
    }
    expanded = true;
    refreshPanel(true);
  }

  function onKeyDown(event) {
    // Alt/Option + Digit — use event.code so Option key on macOS still works
    if (!(event.altKey && !event.ctrlKey && !event.metaKey)) return;
    if (!/^Digit[1-9]$/.test(event.code)) return;
    const n = Number(event.code.slice(5));
    if (!cachedAccounts.length) return;
    if (!DevCreds.fields.findPasswordInput(document)) return;
    event.preventDefault();
    event.stopPropagation();
    fillByIndex(n - 1);
  }

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("resize", scheduleRefresh);
  window.addEventListener("scroll", scheduleRefresh, true);

  const observer = new MutationObserver((mutations) => {
    // Ignore mutations inside our own UI
    for (const m of mutations) {
      const t = m.target;
      if (t?.closest?.("#dev-creds-autofill-panel, #dev-creds-save-prompt")) {
        continue;
      }
      scheduleRefresh();
      return;
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.apps) {
      refreshPanel(true);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refreshPanel(true));
  } else {
    refreshPanel(true);
  }

  window.__devCredsHidePanel = removePanel;
  window.__devCredsShowPanel = () => {
    setDismissed(false);
    expanded = true;
    refreshPanel(true);
  };
})();
