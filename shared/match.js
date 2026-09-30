(function (root) {
  const DevCreds = root.DevCreds || (root.DevCreds = {});

  function isPrivateIPv4(hostname) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!m) return false;
    const parts = m.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }

  function isLocalHost(hostname) {
    if (!hostname) return false;
    const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
    if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
    if (isPrivateIPv4(h)) return true;
    return false;
  }

  function isLocalPage(urlString) {
    try {
      const u = new URL(urlString);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return isLocalHost(u.hostname);
    } catch {
      return false;
    }
  }

  function hostPortFromUrl(urlString) {
    try {
      const u = new URL(urlString);
      if (!isLocalHost(u.hostname)) return null;
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      // Keep brackets out of stored patterns for IPv6
      const host = u.hostname.replace(/^\[|\]$/g, "");
      return `${host}:${port}`;
    } catch {
      return null;
    }
  }

  function normalizePattern(pattern) {
    return String(pattern || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^\[|\]$/g, "");
  }

  function urlMatchesPattern(urlString, pattern) {
    const hostPort = hostPortFromUrl(urlString);
    if (!hostPort) return false;
    const p = normalizePattern(pattern);
    if (!p) return false;
    const hp = hostPort.toLowerCase();
    if (hp === p) return true;
    if (!p.includes(":")) {
      try {
        const u = new URL(urlString);
        const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
        return host === p;
      } catch {
        return false;
      }
    }
    return false;
  }

  function findMatchingApps(apps, urlString) {
    const list = Array.isArray(apps) ? apps : [];
    return list.filter((app) =>
      (app.urlPatterns || []).some((p) => urlMatchesPattern(urlString, p))
    );
  }

  function findAppByHostPort(apps, hostPort) {
    const target = normalizePattern(hostPort);
    return (apps || []).find((app) =>
      (app.urlPatterns || []).some((p) => normalizePattern(p) === target)
    );
  }

  DevCreds.match = {
    hostPortFromUrl,
    isLocalHost,
    isLocalPage,
    isPrivateIPv4,
    normalizePattern,
    urlMatchesPattern,
    findMatchingApps,
    findAppByHostPort,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
