# Mendix Team — Face Auth SDK Handover (`.tgz` Package)

**Document type:** Integration handover (testing phase)  
**Audience:** Mendix development team  
**Package:** `@ascentia/face-auth-sdk`  
**Delivered version:** `0.1.4`  
**Artifact:** `ascentia-face-auth-sdk-0.1.4.tgz`  
**Integration model:** React-based SDK embedded in Mendix (pluggable widget / custom JS)  
**Status:** Testing / UAT handover  

---

## 1. Purpose

This document describes how Ascentia hands over the Face Authentication **npm package as a `.tgz` file**, and how the Mendix team installs and uses it.

Mendix agreed to consume the **React-based SDK only**. Mendix does **not** implement camera UI, liveness, register overlays, or admin-kiosk overlays. Those ship inside the SDK.

| Owned by Mendix | Owned by SDK | Owned by backend API |
|-----------------|--------------|----------------------|
| Employee ID field | Camera / permission | Face match (1:1) |
| Authenticate button | Blink liveness + capture | Enrollment / PENDING approve |
| Mount DOM container | Register + Admin kiosk overlays | Plant scope, audit, auth log |
| Session / navigation after outcome | HTTPS calls to `apiBaseUrl` | Business rules |

---

## 2. What you receive (handover package)

| Item | Description |
|------|-------------|
| `ascentia-face-auth-sdk-0.1.4.tgz` | Installable npm tarball (built `dist/` + typings) |
| This document | Install + usage steps |
| Backend base URL | Live API endpoint for testing (see §6) |
| Contact | Ascentia face-auth engineering (for version upgrades / defects) |

### 2.1 How the `.tgz` is produced (Ascentia side)

```bash
cd sdk
npm run build
npm pack
# → ascentia-face-auth-sdk-0.1.4.tgz
```

The file is then shared with Mendix (secure channel: email attachment, SharePoint, ticket, etc.).

### 2.2 How Mendix gets the file

1. Download / save `ascentia-face-auth-sdk-0.1.4.tgz` from the handover channel.  
2. Place it in the Mendix widget (or JS module) project, recommended path:

```text
<your-mendix-widget>/
  vendor/
    ascentia-face-auth-sdk-0.1.4.tgz
  package.json
  src/
```

3. Do **not** unpack the `.tgz` manually for day-to-day use — `npm install` consumes it as a package.  
4. When Ascentia ships a new version, replace the file and update `package.json` (see §8).

---

## 3. Prerequisites (Mendix environment)

Before install:

1. **Node.js + npm** available for the pluggable widget / frontend build (Studio Pro widget build pipeline or local `npm`).  
2. **React + ReactDOM** `^18` or `^19` already provided by the host widget (peer dependencies — do **not** bundle a second React if Mendix already supplies one).  
3. Page served over **HTTPS** (or `localhost`). Browser camera APIs require a secure context.  
4. A **DOM mount node** on the Mendix page (empty container for SDK overlays).  
5. Network access from the kiosk/browser to the face-auth **backend** URL (§6).  
6. Backend CORS must allow the Mendix origin (Ascentia configures this on the API).

---

## 4. Step-by-step install (`.tgz` → Mendix project)

### Step 1 — Copy the artifact

```text
vendor/ascentia-face-auth-sdk-0.1.4.tgz
```

### Step 2 — Declare the dependency

In the widget / JS module `package.json`:

```json
{
  "name": "your-mendix-face-auth-widget",
  "private": true,
  "dependencies": {
    "@ascentia/face-auth-sdk": "file:./vendor/ascentia-face-auth-sdk-0.1.4.tgz"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

> **Note:** If your Mendix widget already lists `react` / `react-dom` as dependencies, keep a **single** React instance (peer or shared). Duplicate React copies break hooks and overlays.

### Step 3 — Install

From the widget directory:

```bash
npm install
```

Verify the package appears under `node_modules/@ascentia/face-auth-sdk/`.

### Step 4 — Build the Mendix widget

Use your normal Mendix pluggable-widget build (`npm run build` / Studio Pro deploy). Ensure the bundler can resolve `@ascentia/face-auth-sdk` (default webpack/vite widget templates usually work).

### Step 5 — Add a mount container in Mendix UI

On the kiosk page, provide an empty element the SDK can mount into, for example:

- A Container with a fixed HTML element id, e.g. `face-auth-root`, **or**  
- Pass the DOM node reference from the widget into `mountNode`.

Example HTML expectation:

```html
<div id="face-auth-root"></div>
```

Mendix still shows only **Employee ID + Authenticate**. All camera/register UI is drawn by the SDK into `mountNode` / overlay root.

---

## 5. Using the SDK in Mendix code

### 5.1 Import (same whether `.tgz` or hosted npm)

After installation, imports are identical to a registry package:

```ts
import {
  createFaceAuthSDK,
  isFaceAuthApiError,
  type AuthenticateOrRegisterOutcome,
} from "@ascentia/face-auth-sdk";
```

### 5.2 Create the SDK instance

Call this when the page/widget is ready (and you have a mount node):

```ts
const mountNode = document.getElementById("face-auth-root");
if (!mountNode) {
  throw new Error("Missing #face-auth-root mount container.");
}

const sdk = createFaceAuthSDK({
  // Required for API calls — see §6
  apiBaseUrl: "https://face-auth-ascentia.onrender.com",
  mountNode,
  // Optional:
  // title: "Face authentication",
  // showFeedbackToast: true,
});
```

### 5.3 Primary function call (recommended)

Mendix should pass the **Employee ID** from its own input, then call:

```ts
const employeeId = /* from Mendix text box */ "";

try {
  const outcome: AuthenticateOrRegisterOutcome =
    await sdk.authenticateOrRegister(employeeId.trim());

  switch (outcome.outcome) {
    case "authenticated":
      // Face matched — continue Mendix login / open session
      break;

    case "denied":
      // Wrong face for this Employee ID — deny login in Mendix
      break;

    case "registered":
      // Path A self-register submitted (PENDING).
      // Face login works only after plant admin approves in Admin Portal.
      break;

    case "admin_kiosk_session_completed":
      // Path B admin finished batch enroll and ended session.
      break;
  }
} catch (error) {
  if (isFaceAuthApiError(error)) {
    // Stable machine code for branching / logging
    console.error(error.code, error.message);
    // Show Mendix error message to operator
  } else {
    // Cancelled, camera failure, unexpected error
    console.error(error);
  }
} finally {
  await sdk.destroy();
}
```

### 5.4 Cleanup (mandatory)

Always call when leaving the page / unmounting the widget:

```ts
await sdk.destroy();
```

This stops the camera and unmounts overlays so media streams do not leak.

### 5.5 What Mendix must **not** call for normal kiosk login

For the standard worker flow, prefer **`authenticateOrRegister(employeeId)`** only.

Do **not** rebuild camera pages in Mendix. Optional lower-level APIs exist (`authenticate`, register helpers) but the supported Mendix integration path for UAT is `authenticateOrRegister` + `destroy`.

---

## 6. Backend URL (which API the SDK calls)

The SDK does **not** embed a production URL. Mendix **must** pass `apiBaseUrl` when creating the SDK.

| Environment | `apiBaseUrl` value | Notes |
|-------------|--------------------|--------|
| **Shared cloud test (current)** | `https://face-auth-ascentia.onrender.com` | Live Render API used for UAT |
| Local Ascentia backend | `http://localhost:8000` | Only if API runs on the same machine; kiosk devices usually cannot use this |
| Future customer deployment | `https://<customer-face-auth-host>` | Provided by Ascentia at go-live |

### 6.1 Endpoints the SDK calls (informational)

Mendix does not call these directly. The SDK uses `apiBaseUrl` as origin, for example:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/authenticate` | Worker face login (1:1) |
| `POST` | `/register` | Path A self-registration (PENDING) |
| `GET` | `/plants` | Plant list for register UI |
| `POST` | `/kiosk/admin-login` | Path B admin session |
| `POST` | `/kiosk/admin-enroll` | Path B fresh enroll |
| `POST` | `/kiosk/admin-logout` | End admin session |

Admin Portal (approve queue, Auth Log, etc.) is a **separate** React app — not part of this Mendix SDK package.

### 6.2 CORS

Browser calls go from the **Mendix origin** → `apiBaseUrl`.  
Ascentia must allow that origin on the backend (`CORS_ALLOW_ORIGINS`). Share your Mendix test URL with Ascentia if calls fail with CORS errors.

---

## 7. Runtime checklist (kiosk)

- [ ] Page is **HTTPS** (or localhost)  
- [ ] Camera permission granted  
- [ ] `#face-auth-root` (or `mountNode`) present  
- [ ] `apiBaseUrl` set to the agreed backend  
- [ ] Employee ID entered in Mendix UI before Authenticate  
- [ ] `await sdk.destroy()` on leave  
- [ ] One React copy in the widget bundle  

---

## 8. Upgrading the SDK version

When Ascentia sends `ascentia-face-auth-sdk-0.1.5.tgz` (example):

1. Replace the file under `vendor/`.  
2. Update `package.json`:

```json
"@ascentia/face-auth-sdk": "file:./vendor/ascentia-face-auth-sdk-0.1.5.tgz"
```

3. Run `npm install` again.  
4. Rebuild / redeploy the Mendix widget.  
5. Confirm the version in handover notes matches the filename.

**Do not** mix old and new `.tgz` files in `package.json`.

---

## 9. Future: private npm host (optional)

Install source may later change to a private registry (GitLab / GitHub Packages).  

**Application code does not change** — only `package.json` / `.npmrc`:

```json
"@ascentia/face-auth-sdk": "0.1.4"
```

Imports and `createFaceAuthSDK` / `authenticateOrRegister` / `destroy` remain the same.

For this testing phase, **`.tgz` file install is the agreed delivery method.**

---

## 10. Support & defects

Please include when raising an issue:

- SDK `.tgz` version (e.g. `0.1.4`)  
- Mendix / browser / kiosk OS  
- `apiBaseUrl` used  
- Employee ID scenario (auth success / fail / register / admin enroll)  
- Exact error `code` from `isFaceAuthApiError` when available  
- Timestamp of the attempt  

---

## 11. Summary

| Topic | Answer |
|-------|--------|
| Delivery for testing | `ascentia-face-auth-sdk-0.1.4.tgz` |
| Install | `file:./vendor/….tgz` + `npm install` |
| Mendix UI | Employee ID + Authenticate + mount node only |
| Main API | `createFaceAuthSDK` → `authenticateOrRegister` → `destroy` |
| Backend | `apiBaseUrl: "https://face-auth-ascentia.onrender.com"` (current test) |
| Same as hosted npm after install? | **Yes** — calling code is identical |

---

*Ascentia Face Authentication — Mendix SDK handover (`.tgz` testing phase)*  
*Package: `@ascentia/face-auth-sdk@0.1.4`*
