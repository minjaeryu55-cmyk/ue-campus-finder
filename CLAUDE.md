# UE Campus Finder

Course project (GUI Design & Web Optimization, Week 3–4). A mobile-first lost-and-found web app for UE students.
Deliverables: lo-fi prototype, codebase link (GitHub), build link (Netlify / GitHub Pages).

## Files
- `index.html` – the app UI (vanilla HTML/CSS/JS, no build step).
- `shared.js` – rules shared by app and server: colour palette, synonym normalisation, matching, seed data. Classic script + CommonJS.
- `netlify/functions/api.mjs` – API (`/api/*`): Microsoft ID-token check, Netlify Blobs storage, SMTP email.
- `vendor/msal-browser.min.js` – Microsoft sign-in library (v3.30.0), self-hosted so it is cached offline.
- `manifest.webmanifest`, `sw.js`, `icon*` – installable mobile app (PWA).
- `tests/api.test.mjs` – `npm test`. `SETUP.md` – Azure/Netlify/SMTP setup (Korean).
- `lofi-wireframes.html` – lo-fi wireframes (screens 1–7). The app labels its screens "Wireframe 1–7" to match.

## Design goal
Students who lose something on campus can quickly and easily find out whether it has been found and where it is, without having to search in many places on their own.

## Problem (from research + 2 interviews)
- Students search alone: go back to places, ask friends, then check the lost & found office.
- Found items are stored in different places (e.g. library desk ~2 weeks, then central office) and students can't check online.
- Many owners never come back, partly because they don't remember where they lost the item.
- Losing a wallet means extra stress (cancelling cards, replacing IDs).
- Offices must verify the person claiming an item is the real owner.

## Screens / features (keep wireframe numbering)
1. Home – one search across all storage places, "I lost" / "I found", latest items
2. Search – name search, category + place filters (place optional, includes "Don’t remember")
3. Item detail + claim – current storage location, days left, ownership question before pickup info; finder contact stays private
4. I lost something – register item (name, category, last place, optional photo) → alerts
5. I found something – name, category, where found, where stored now, optional photo, ownership question + private answer
6. Campus map – zones with item counts, tap a zone to filter
7. Alerts – registered lost items; auto-match when a similar item (same category/place) is handed in

## Consistency of descriptions
- Colours are picked from a fixed 14-colour palette (max 2), not typed. Matching requires a shared colour when both sides chose one.
- Free text (search, names, ownership answers) is normalised in `shared.js` (`gray`→`grey`, `navy`→`blue`, `AirPods`→`earbuds`, plurals, punctuation, case).
- Optional "brand / distinctive mark" field and photos for visual comparison.

## Technical notes
- Two modes: **demo** (file:// or GitHub Pages; `localStorage` key `uecf-v3`) and **live** (Netlify, when `/api/config` returns `MS_CLIENT_ID`).
- Live mode: sign-in with Microsoft (MSAL redirect flow); the ID token is sent as Bearer and verified server-side. Ownership answers and finder emails never leave the server.
- Phone notifications: Web Push (`web-push`, VAPID env keys), subscriptions in blob `subs`; `sw.js` shows them. Demo mode shows local notifications on the same device.
- Storage period: items have `expires` (ISO). Finder or `ADMIN_EMAILS` can change it (and the storage place) on the detail screen.
- Photos are resized with canvas to ≤360px JPEG before storing.
- Demo ownership answers: wallet `computer`, earbuds `blue`, keys `bear`, tumbler `black`, boot `nike`.
- Supports light/dark via `prefers-color-scheme`. Mobile layout, max width 480px.
- `index.html` must keep working when opened directly (demo mode) – no ES modules on the client.

## Deployment
- Codebase: https://github.com/minjaeryu55-cmyk/ue-campus-finder
- Build: https://lambent-pavlova-1fa1a2.netlify.app (Netlify, public)
- Alternative build: https://minjaeryu55-cmyk.github.io/ue-campus-finder/ (GitHub Pages)
- Deploy = push to `main`. Netlify must be linked to the GitHub repo (drag-and-drop does not deploy functions); env vars in `SETUP.md`.

## Working rules
- UI language: English. School name "UE" appears in the app name and the central office.
- Keep changes small and explain them in one or two sentences.
- Backend = Netlify Functions only (requested by the user for Microsoft login + email). Don't add other services/libraries unless asked.
