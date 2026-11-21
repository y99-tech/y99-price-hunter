# Y99 Price Hunter

Desktop app (Windows + macOS) that watches prices for the gear you want — across Egyptian camera stores,
**Facebook Marketplace** and **OLX (dubizzle)** — and tells you when something drops to your price.

It's the desktop edition of the Price Hunter in Y99 OS (y99.tech/os), made so anyone can run it on their
own computer with their own accounts.

## Download

Go to **Releases** (or the latest **Actions → Build** run) and download:

| System | File |
| --- | --- |
| Windows | `Y99-Price-Hunter-Setup-x.y.z.exe` (installer) or `Y99-Price-Hunter-Portable-x.y.z.exe` |
| Mac (Apple silicon, M1–M4) | `Y99-Price-Hunter-x.y.z-mac-arm64.dmg` |
| Mac (Intel) | `Y99-Price-Hunter-x.y.z-mac-x64.dmg` |

The builds are not code-signed yet:

- **Windows:** SmartScreen shows "Windows protected your PC" → *More info* → *Run anyway*.
- **Mac:** first launch, right-click the app → *Open* → *Open*. If macOS says the app is "damaged", run
  `xattr -cr "/Applications/Y99 Price Hunter.app"` in Terminal once.

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
