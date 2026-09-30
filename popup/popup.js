(function () {
  const els = {
    context: document.getElementById("context-line"),
    viewFill: document.getElementById("view-fill"),
    viewManage: document.getElementById("view-manage"),
    btnManage: document.getElementById("btn-manage"),
    btnBack: document.getElementById("btn-back"),
    appPickerWrap: document.getElementById("app-picker-wrap"),
    appSelect: document.getElementById("app-select"),
    accounts: document.getElementById("accounts"),
    emptyFill: document.getElementById("empty-fill"),
    status: document.getElementById("status"),
    manageList: document.getElementById("manage-list"),
    manageEmpty: document.getElementById("manage-empty"),
    btnAddApp: document.getElementById("btn-add-app"),
    btnExport: document.getElementById("btn-export"),
    importFile: document.getElementById("import-file"),
  };

  let apps = [];
  let tabUrl = "";
  let selectedAppId = null;

  function setStatus(text, isError) {
    els.status.textContent = text || "";
    els.status.classList.toggle("error", Boolean(isError));
  }

  function showFill() {
    els.viewFill.classList.remove("hidden");
    els.viewManage.classList.add("hidden");
    els.btnManage.classList.remove("hidden");
  }

  function showManage() {
    els.viewFill.classList.add("hidden");
    els.viewManage.classList.remove("hidden");
    els.btnManage.classList.add("hidden");
    renderManage();
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "PING_FILL" });
      return true;
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            "shared/match.js",
            "shared/storage.js",
            "shared/fields.js",
            "content/fill.js",
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  async function fillAccount(account) {
    setStatus("");
    const tab = await getActiveTab();
    if (!tab?.id) {
      setStatus("No active tab.", true);
      return;
    }
    if (!DevCreds.match.isLocalPage(tab.url || "")) {
      setStatus("Open a local/dev login page first.", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      setStatus("Could not reach this page. Reload and try again.", true);
      return;
    }

    try {
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "FILL_CREDENTIALS",
        username: account.username,
        password: account.password,
      });
      if (result?.ok) {
        setStatus(
          result.filledUsername
            ? `Filled ${account.label}`
            : `Filled password for ${account.label} (no username field)`
        );
      } else {
        setStatus(result?.error || "Fill failed.", true);
      }
    } catch (err) {
      setStatus(String(err?.message || err), true);
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${label}`);
    } catch {
      setStatus("Clipboard copy failed.", true);
    }
  }

  function currentApp() {
    return apps.find((a) => a.id === selectedAppId) || null;
  }

  function renderAccounts() {
    const app = currentApp();
    els.accounts.innerHTML = "";
    const list = app?.accounts || [];
    els.emptyFill.classList.toggle("hidden", list.length > 0);

    for (const account of list) {
      const row = document.createElement("div");
      row.className = "account-row";

      const main = document.createElement("button");
      main.type = "button";
      main.className = "account-main";
      main.innerHTML = `
        <span class="account-label">${escapeHtml(account.label)}</span>
        <span class="account-user">${escapeHtml(account.username)}</span>
      `;
      main.addEventListener("click", () => fillAccount(account));

      const copies = document.createElement("div");
      copies.className = "copy-actions";
      const copyUser = document.createElement("button");
      copyUser.type = "button";
      copyUser.textContent = "User";
      copyUser.title = "Copy username";
      copyUser.addEventListener("click", () =>
        copyText(account.username, "username")
      );
      const copyPass = document.createElement("button");
      copyPass.type = "button";
      copyPass.textContent = "Pass";
      copyPass.title = "Copy password";
      copyPass.addEventListener("click", () =>
        copyText(account.password, "password")
      );
      copies.append(copyUser, copyPass);

      row.append(main, copies);
      els.accounts.appendChild(row);
    }
  }

  function renderAppPicker(matched) {
    const show =
      apps.length > 0 &&
      (matched.length === 0 || matched.length > 1 || apps.length > 1);
    els.appPickerWrap.classList.toggle("hidden", !show);

    els.appSelect.innerHTML = "";
    const optionsSource = matched.length > 1 ? matched : apps;

    for (const app of optionsSource) {
      const opt = document.createElement("option");
      opt.value = app.id;
      opt.textContent = app.name;
      els.appSelect.appendChild(opt);
    }

    if (selectedAppId) {
      els.appSelect.value = selectedAppId;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshFillView() {
    apps = await DevCreds.storage.getApps();
    const matched = tabUrl
      ? DevCreds.match.findMatchingApps(apps, tabUrl)
      : [];

    if (matched.length === 1) {
      selectedAppId = matched[0].id;
      els.context.textContent = matched[0].name;
    } else if (matched.length > 1) {
      if (!matched.some((a) => a.id === selectedAppId)) {
        selectedAppId = matched[0].id;
      }
      els.context.textContent = "Multiple apps match — pick one";
    } else if (apps.length) {
      if (!apps.some((a) => a.id === selectedAppId)) {
        selectedAppId = apps[0].id;
      }
      const hp = tabUrl ? DevCreds.match.hostPortFromUrl(tabUrl) : null;
      els.context.textContent = hp
        ? `No match for ${hp} — pick an app`
        : "Pick an app";
    } else {
      selectedAppId = null;
      els.context.textContent = tabUrl
        ? "No saved apps yet"
        : "Open a localhost page";
    }

    renderAppPicker(matched);
    renderAccounts();
  }

  function renderManage() {
    els.manageList.innerHTML = "";
    els.manageEmpty.classList.toggle("hidden", apps.length > 0);

    for (const app of apps) {
      const card = document.createElement("div");
      card.className = "app-card";

      const title = document.createElement("h2");
      title.textContent = "App";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = app.name;
      nameInput.placeholder = "App name";

      const patternsLabel = document.createElement("label");
      patternsLabel.textContent = "URL patterns (comma-separated)";
      const patternsInput = document.createElement("input");
      patternsInput.type = "text";
      patternsInput.value = (app.urlPatterns || []).join(", ");
      patternsInput.placeholder = "localhost:3000";

      const saveAppBtn = document.createElement("button");
      saveAppBtn.type = "button";
      saveAppBtn.className = "primary";
      saveAppBtn.textContent = "Save app";
      saveAppBtn.addEventListener("click", async () => {
        const patterns = patternsInput.value
          .split(",")
          .map((p) => DevCreds.match.normalizePattern(p))
          .filter(Boolean);
        await DevCreds.storage.updateApp(app.id, {
          name: nameInput.value.trim() || app.name,
          urlPatterns: patterns.length ? patterns : app.urlPatterns,
        });
        apps = await DevCreds.storage.getApps();
        renderManage();
        setStatus("App saved");
      });

      const delAppBtn = document.createElement("button");
      delAppBtn.type = "button";
      delAppBtn.className = "danger";
      delAppBtn.textContent = "Delete app";
      delAppBtn.addEventListener("click", async () => {
        if (!confirm(`Delete “${app.name}” and all accounts?`)) return;
        await DevCreds.storage.deleteApp(app.id);
        apps = await DevCreds.storage.getApps();
        renderManage();
      });

      const actions = document.createElement("div");
      actions.className = "inline-actions";
      actions.append(saveAppBtn, delAppBtn);

      card.append(title, nameInput, patternsLabel, patternsInput, actions);

      for (const account of app.accounts || []) {
        const block = document.createElement("div");
        block.className = "account-edit";

        const editRow = document.createElement("div");
        editRow.className = "edit-row";

        const labelIn = document.createElement("input");
        labelIn.type = "text";
        labelIn.value = account.label;
        labelIn.placeholder = "Label";

        const userIn = document.createElement("input");
        userIn.type = "text";
        userIn.value = account.username;
        userIn.placeholder = "Username";

        const passIn = document.createElement("input");
        passIn.type = "password";
        passIn.value = account.password;
        passIn.placeholder = "Password";

        editRow.append(labelIn, userIn);
        block.append(editRow, passIn);

        const accActions = document.createElement("div");
        accActions.className = "inline-actions";

        const saveAcc = document.createElement("button");
        saveAcc.type = "button";
        saveAcc.className = "primary";
        saveAcc.textContent = "Save account";
        saveAcc.addEventListener("click", async () => {
          await DevCreds.storage.updateAccount(app.id, account.id, {
            label: labelIn.value.trim() || account.label,
            username: userIn.value,
            password: passIn.value,
          });
          apps = await DevCreds.storage.getApps();
          renderManage();
          setStatus("Account saved");
        });

        const delAcc = document.createElement("button");
        delAcc.type = "button";
        delAcc.className = "danger";
        delAcc.textContent = "Delete";
        delAcc.addEventListener("click", async () => {
          await DevCreds.storage.deleteAccount(app.id, account.id);
          apps = await DevCreds.storage.getApps();
          renderManage();
        });

        accActions.append(saveAcc, delAcc);
        block.appendChild(accActions);
        card.appendChild(block);
      }

      const addAcc = document.createElement("button");
      addAcc.type = "button";
      addAcc.className = "ghost";
      addAcc.textContent = "Add account";
      addAcc.style.marginTop = "8px";
      addAcc.addEventListener("click", async () => {
        const label = prompt("Label (e.g. Admin)");
        if (label === null) return;
        const username = prompt("Username / email");
        if (!username) return;
        const password = prompt("Password");
        if (password === null) return;
        await DevCreds.storage.addAccount(app.id, {
          label: label || username,
          username,
          password,
        });
        apps = await DevCreds.storage.getApps();
        renderManage();
      });

      card.appendChild(addAcc);
      els.manageList.appendChild(card);
    }
  }

  els.btnManage.addEventListener("click", async () => {
    apps = await DevCreds.storage.getApps();
    showManage();
  });

  els.btnBack.addEventListener("click", async () => {
    showFill();
    await refreshFillView();
  });

  els.appSelect.addEventListener("change", () => {
    selectedAppId = els.appSelect.value;
    const app = currentApp();
    if (app) els.context.textContent = app.name;
    renderAccounts();
  });

  els.btnAddApp.addEventListener("click", async () => {
    const name = prompt("App name");
    if (!name) return;
    const pattern = prompt("URL pattern (e.g. localhost:3000)", "localhost:3000");
    if (!pattern) return;
    apps = await DevCreds.storage.getApps();
    apps.push({
      id: DevCreds.storage.uuid(),
      name: name.trim(),
      urlPatterns: [DevCreds.match.normalizePattern(pattern)],
      accounts: [],
    });
    await DevCreds.storage.setApps(apps);
    renderManage();
  });

  els.btnExport.addEventListener("click", async () => {
    const json = await DevCreds.storage.exportJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dev-creds-export.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await DevCreds.storage.importJson(text);
      apps = await DevCreds.storage.getApps();
      renderManage();
      setStatus("Import complete");
    } catch (err) {
      setStatus(String(err?.message || err), true);
    } finally {
      els.importFile.value = "";
    }
  });

  (async function init() {
    const tab = await getActiveTab();
    tabUrl = tab?.url || "";
    await refreshFillView();
  })();
})();
