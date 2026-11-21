# Y99 Price Hunter

Desktop app (Windows + macOS) that watches prices for the gear you want — across Egyptian camera stores,
**Facebook Marketplace** and **OLX (dubizzle)** — and tells you when something drops to your price.

It's the desktop edition of the Price Hunter in Y99 OS (y99.tech/os), made so anyone can run it on their
own computer with their own accounts.

## Download

Go to **[Releases](../../releases/latest)** and pick one file:

| Your computer | Download | What to do |
| --- | --- | --- |
| **Windows** | `Y99-Price-Hunter-Windows-Setup.exe` | Double-click. It installs in a few seconds, opens, and puts a shortcut on your Desktop. |
| **Windows, no install** | `Y99-Price-Hunter-Windows-Portable.exe` | Double-click to run. Nothing is installed; works from a USB stick too. |
| **Windows, if your antivirus blocks the .exe** | `Y99-Price-Hunter-Windows-NoInstall.zip` | Right-click → *Extract All*, open the folder, double-click **Y99 Price Hunter.exe**. |
| **Mac** (Apple chip M1–M4 or Intel) | `Y99-Price-Hunter-Mac.dmg` | Open it, drag **Y99 Price Hunter** into **Applications**, then double-click **Open-Me-First-Mac** (once). |

**First time only:**

- **Windows** may say *"Windows protected your PC"*. Click **More info → Run anyway**. (The app isn't
  code-signed yet; it's safe.)
- **Mac:** if *Open-Me-First-Mac* itself is blocked, right-click it → **Open** → **Open**. Or open
  **System Settings → Privacy & Security** and click **Open Anyway** next to Y99 Price Hunter. After that
  it opens normally from Launchpad.

### Antivirus says it's a threat?

The app is new and not code-signed yet, so some antivirus apps (Norton, Avast, etc.) block it based on
"reputation": too few people have downloaded it so far. It contains no malware: the full source code is
in this repository and every download is built automatically by GitHub Actions from that code.

- Use the **NoInstall.zip** download; it is flagged far less often than the installer.
- Or, in Norton: open the alert → **Restore & exclude this file**.
- Every report of a false alarm helps the app build reputation, so it stops being flagged for everyone.

## How it works

1. **Watchlist** — add an item: a name, one or more searches (`NP-FZ100`, `FZ100`), words the title
   *must* contain, words to *skip* (`dummy, charger`), a reference price, an alert price, and an
   "ignore prices under" floor for fake marketplace prices.
2. **Hunt** — every few hours (or on *Hunt now*) the app searches every source, keeps the listings that
   match, tracks each one's price history, and shows the cheapest live offer and how much you save.
3. **Alerts** — a desktop notification when an item hits your alert price or a new low. Click it to open
   the listing.

### Sources

| Type | How it searches | Login |
| --- | --- | --- |
| WooCommerce stores | public Store API (`/wp-json/wc/store/v1/products`) | none |
| Shopify stores | public search (`/search/suggest.json`) | none |
| Web page | opens the store's search page and reads product cards | none |
| Facebook Marketplace | opens Marketplace search with **your** session | your Facebook |
| OLX / dubizzle Egypt | opens OLX search with **your** session | optional |

17 Egyptian camera stores come preloaded (Shams, Dot Cam, RayStore, General, CameraX, Fotoexpress,
King Digital, DMT, ESA CAM, …). Add any other store from **Sources**.

### Your cookies, your computer

On **Accounts** you sign in to Facebook / OLX on the real site, inside the app. The app never sees your
password. It keeps the site's cookies in its own private browser profile on your computer (like a
separate Chrome profile) and uses them only to open search pages for you. Nothing is sent to Y99 or
anywhere else. *Sign out & clear cookies* removes them.

Marketplace searches are deliberately slow (a few seconds apart). Automated browsing may still be
against Facebook's or OLX's terms, so keep the hunt interval reasonable and use your own account.

Data (watchlist, offers, history) is a JSON file in the app's data folder:
`%APPDATA%\Y99 Price Hunter` on Windows, `~/Library/Application Support/Y99 Price Hunter` on Mac.

## Develop

```bash
npm install
npm start          # run the app
npm test           # unit tests (price parsing, matching, hunt logic)
npm run dist:win   # build Windows installers (on Windows)
npm run dist:mac   # build Mac .dmg/.zip (on a Mac)
```

Pushing to `main` builds Windows and Mac on GitHub Actions; pushing a tag like `v1.0.0` also attaches the
installers to a GitHub Release.

```
main.js          Electron main: windows, tray, scheduler, sign-in windows, hidden search pages
preload.js       safe bridge to the UI
src/hunter.js    the hunt: search → match → offers, history, best price, alerts
src/sources.js   source adapters + built-in store list + page reader for Marketplace/OLX
src/match.js     price parsing (EGP, Arabic digits) and title matching
ui/              the interface (Y99 black + green)
```
