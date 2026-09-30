(function (root) {
  const DevCreds = root.DevCreds || (root.DevCreds = {});

  const IGNORE_NAME_RE =
    /search|query|q\b|otp|totp|mfa|code|token|captcha|csrf|honeypot|filter|sort/i;
  const USER_HINT_RE =
    /user|email|login|account|identifier|member|phone|mobile|signin|sign-in|username|userid|user-?id|mail/i;
  const NEW_PASS_RE = /new.?pass|confirm|repeat|re-?enter|verify.?pass/i;
  const CURRENT_PASS_RE = /current|old.?pass|existing/i;

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.readOnly && el.type !== "password") return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    if (el.type === "hidden") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function attrBlob(el) {
    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("autocomplete"),
      el.getAttribute("aria-label"),
      el.getAttribute("data-testid"),
      el.className,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function scorePasswordInput(el) {
    const blob = attrBlob(el);
    let score = 10;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac === "current-password") score += 40;
    if (ac === "new-password") score -= 50;
    if (NEW_PASS_RE.test(blob)) score -= 40;
    if (CURRENT_PASS_RE.test(blob)) score += 25;
    if (/password|passwd|pass|pwd/i.test(blob)) score += 10;
    return score;
  }

  function findPasswordInput(rootEl) {
    const scope = rootEl || document;
    const candidates = [...scope.querySelectorAll('input[type="password"]')]
      .filter(isVisible)
      .map((el) => ({ el, score: scorePasswordInput(el) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function scoreUsernameInput(el, passwordInput) {
    const type = (el.type || "text").toLowerCase();
    if (["hidden", "submit", "button", "checkbox", "radio", "file", "password"].includes(type)) {
      return -Infinity;
    }
    const blob = attrBlob(el);
    if (IGNORE_NAME_RE.test(blob) && !USER_HINT_RE.test(blob)) return -Infinity;

    let score = 0;
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac === "username" || ac === "email" || ac === "nickname") score += 50;
    if (type === "email") score += 35;
    if (type === "tel") score += 15;
    if (type === "text") score += 8;
    if (USER_HINT_RE.test(blob)) score += 30;
    if (el.required) score += 5;

    if (passwordInput) {
      const form = passwordInput.closest("form");
      const elForm = el.closest("form");
      if (form && elForm === form) score += 25;
      else if (form && elForm && elForm !== form) score -= 20;

      const pRect = passwordInput.getBoundingClientRect();
      const uRect = el.getBoundingClientRect();
      const dy = Math.abs(uRect.top - pRect.top);
      const dx = Math.abs(uRect.left - pRect.left);
      if (dy < 120 && uRect.bottom <= pRect.top + 8) score += 20;
      if (dy < 80) score += 10;
      if (dx < 40) score += 5;
      // Prefer fields above the password
      if (uRect.top < pRect.top) score += 8;
      if (uRect.top > pRect.bottom + 40) score -= 15;
    }

    return score;
  }

  function findUsernameInput(passwordInput, rootEl) {
    const form = passwordInput?.closest("form");
    const scope = form || rootEl || document;
    const candidates = [
      ...scope.querySelectorAll(
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'
      ),
    ].filter(isVisible);

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (el === passwordInput) continue;
      const score = scoreUsernameInput(el, passwordInput);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    // Fallback: previous text-like input in the same form
    if (!best && passwordInput && form) {
      const inputs = [...form.querySelectorAll("input")].filter(isVisible);
      const pwdIdx = inputs.indexOf(passwordInput);
      for (let i = pwdIdx - 1; i >= 0; i--) {
        const t = (inputs[i].type || "text").toLowerCase();
        if (["text", "email", "tel", "url"].includes(t)) return inputs[i];
      }
    }

    if (best && bestScore >= 8) return best;
    if (best && bestScore > 0) return best;
    return null;
  }

  function readCredentials(fromEl) {
    const form = fromEl && fromEl.closest ? fromEl.closest("form") : null;
    const passwordInput = findPasswordInput(form || document);
    if (!passwordInput) return null;
    // Skip obvious signup / change-password flows for capture
    if (scorePasswordInput(passwordInput) < 5) return null;
    const usernameInput = findUsernameInput(passwordInput, form || document);
    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput.value || "";
    if (!username || !password) return null;
    return { username, password, usernameInput, passwordInput };
  }

  function setNativeValue(input, value) {
    input.focus();
    const proto = window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertReplacementText",
          data: value,
        })
      );
    } catch {
      /* InputEvent may be restricted in some contexts */
    }
  }

  function fillCredentials(username, password) {
    const passwordInput = findPasswordInput(document);
    if (!passwordInput) {
      return { ok: false, error: "No password field found on this page." };
    }
    const usernameInput = findUsernameInput(passwordInput, document);
    if (usernameInput) setNativeValue(usernameInput, username);
    setNativeValue(passwordInput, password);
    return {
      ok: true,
      filledUsername: Boolean(usernameInput),
      filledPassword: true,
    };
  }

  DevCreds.fields = {
    isVisible,
    findPasswordInput,
    findUsernameInput,
    readCredentials,
    setNativeValue,
    fillCredentials,
    scorePasswordInput,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
