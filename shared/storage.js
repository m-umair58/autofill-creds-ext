(function (root) {
  const DevCreds = root.DevCreds || (root.DevCreds = {});

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function getApps() {
    const data = await chrome.storage.local.get({ apps: [] });
    return Array.isArray(data.apps) ? data.apps : [];
  }

  async function setApps(apps) {
    await chrome.storage.local.set({ apps: Array.isArray(apps) ? apps : [] });
  }

  async function saveAccount({ appName, urlPattern, label, username, password }) {
    const apps = await getApps();
    const pattern = DevCreds.match.normalizePattern(urlPattern);
    let app = DevCreds.match.findAppByHostPort(apps, pattern);

    if (!app) {
      app = {
        id: uuid(),
        name: appName || pattern,
        urlPatterns: [pattern],
        accounts: [],
      };
      apps.push(app);
    } else if (appName && appName.trim() && app.name !== appName.trim()) {
      // Keep existing name unless user provided a clearer one on first create only —
      // on update, allow rename from save prompt when they edit the field.
      app.name = appName.trim();
    }

    const existing = (app.accounts || []).find(
      (a) => a.username === username
    );
    if (existing) {
      existing.password = password;
      if (label && label.trim()) existing.label = label.trim();
    } else {
      app.accounts = app.accounts || [];
      app.accounts.push({
        id: uuid(),
        label: (label && label.trim()) || username,
        username,
        password,
      });
    }

    await setApps(apps);
    return app;
  }

  async function updateApp(appId, patch) {
    const apps = await getApps();
    const idx = apps.findIndex((a) => a.id === appId);
    if (idx === -1) return null;
    apps[idx] = { ...apps[idx], ...patch, id: apps[idx].id };
    await setApps(apps);
    return apps[idx];
  }

  async function deleteApp(appId) {
    const apps = await getApps();
    await setApps(apps.filter((a) => a.id !== appId));
  }

  async function addAccount(appId, { label, username, password }) {
    const apps = await getApps();
    const app = apps.find((a) => a.id === appId);
    if (!app) return null;
    app.accounts = app.accounts || [];
    const existing = app.accounts.find((a) => a.username === username);
    if (existing) {
      existing.password = password;
      if (label) existing.label = label;
      await setApps(apps);
      return existing;
    }
    const account = {
      id: uuid(),
      label: label || username,
      username,
      password,
    };
    app.accounts.push(account);
    await setApps(apps);
    return account;
  }

  async function updateAccount(appId, accountId, patch) {
    const apps = await getApps();
    const app = apps.find((a) => a.id === appId);
    if (!app) return null;
    const acc = (app.accounts || []).find((a) => a.id === accountId);
    if (!acc) return null;
    Object.assign(acc, patch, { id: acc.id });
    await setApps(apps);
    return acc;
  }

  async function deleteAccount(appId, accountId) {
    const apps = await getApps();
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    app.accounts = (app.accounts || []).filter((a) => a.id !== accountId);
    await setApps(apps);
  }

  async function exportJson() {
    const apps = await getApps();
    return JSON.stringify({ apps }, null, 2);
  }

  async function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.apps)) {
      throw new Error("Invalid export: expected { apps: [] }");
    }
    const normalized = parsed.apps.map((app) => ({
      id: app.id || uuid(),
      name: app.name || "Untitled",
      urlPatterns: Array.isArray(app.urlPatterns) ? app.urlPatterns : [],
      accounts: Array.isArray(app.accounts)
        ? app.accounts.map((a) => ({
            id: a.id || uuid(),
            label: a.label || a.username || "Account",
            username: a.username || "",
            password: a.password || "",
          }))
        : [],
    }));
    await setApps(normalized);
    return normalized;
  }

  DevCreds.storage = {
    uuid,
    getApps,
    setApps,
    saveAccount,
    addAccount,
    updateApp,
    deleteApp,
    updateAccount,
    deleteAccount,
    exportJson,
    importJson,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
