# Dev Creds Autofill

Chrome extension for local development: save login credentials the first time you sign in on a local/dev host, then one-click (or Alt+N) fill accounts with different privilege levels (Admin, User, etc.).

Credentials are stored only in **`chrome.storage.local`** on this machine (not synced to Google, not in the page’s `localStorage`).

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `autofill-creds`

## First-login save

1. Open your app’s login page (e.g. `http://localhost:3000/login`)
2. Sign in with an account (e.g. Admin)
3. When the **Save account for Dev Creds?** prompt appears, set a label like `Admin` and click **Save**
4. Repeat for other roles (User, Viewer, …)

The extension creates an app keyed by `host:port` (e.g. `localhost:3000`) automatically.

## One-click fill

On a local login page with saved accounts, a **Dev Creds** panel appears near the password field. Click a role to fill, or press **Alt+1** / **Alt+2** / **Alt+3** for the first accounts.

You can still open the extension popup for copy buttons and Manage.

**Dismiss (×)** collapses to a chip and stays that way for the tab session. Click the chip (or reload the tab) to expand again. Focusing the form does not undo dismiss.

## Manage

In the popup, open **Manage** to:

- Rename apps and edit URL patterns (`localhost:3000`, `192.168.1.10:8080`, …)
- Edit / delete accounts
- Add apps or accounts manually
- **Export** / **Import** JSON backups

## Scope

Activates only on local/dev hosts:

- `localhost`, `*.localhost`, `127.0.0.1`, `::1`
- `*.local`
- Private LAN IPs (`10.x`, `172.16–31.x`, `192.168.x`, link-local)

HTTP and HTTPS. Scripts may load on other sites but exit immediately when the host is not local. Fill does not auto-submit the form.

## Project layout

```
manifest.json
background.js
popup/          # extension popup
content/        # auto panel, save prompt, fill handler
shared/         # storage, URL matching, field helpers
icons/
```
