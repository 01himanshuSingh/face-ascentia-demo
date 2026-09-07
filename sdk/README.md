# @ascentia/face-auth-sdk

Face authentication for Mendix kiosks: camera, blink liveness, capture, Path A register, Path B admin enroll. The backend (`apiBaseUrl`) owns matching and enrollment decisions.

## Install

```bash
npm install @ascentia/face-auth-sdk
```

**Peer dependencies (provided by the host app):** `react` and `react-dom` (^18 or ^19).

## Requirements

- HTTPS page (or `localhost`) — camera will not work on plain HTTP remote hosts
- User grants camera permission
- A DOM node for overlays (SDK mounts its own React root there)
- Reachable face-auth API (`CORS_ALLOW_ORIGINS` must allow the Mendix origin)

## Minimal usage

```tsx
import { createFaceAuthSDK, isFaceAuthApiError } from "@ascentia/face-auth-sdk";

const mountNode = document.getElementById("face-auth-root");
if (!mountNode) throw new Error("Missing #face-auth-root");

const sdk = createFaceAuthSDK({
  apiBaseUrl: "https://face-auth-ascentia.onrender.com",
  mountNode,
});

try {
  const outcome = await sdk.authenticateOrRegister(employeeId);
  if (outcome.outcome === "authenticated") {
    // Mendix: continue login session
  } else if (outcome.outcome === "denied") {
    // Mendix: deny login
  } else if (outcome.outcome === "registered") {
    // Path A submitted — wait for admin approve
  }
} catch (error) {
  if (isFaceAuthApiError(error)) {
    // Use error.code / error.message
  }
  throw error;
} finally {
  await sdk.destroy();
}
```

## Cleanup

Always call `await sdk.destroy()` when leaving the Mendix page (navigation / unmount). This closes the camera and unmounts overlays so streams and React roots do not leak.

## What Mendix does *not* build

Camera UI, blink prompts, register form, and admin-kiosk overlays are **inside this package**. Mendix only provides Employee ID + Authenticate and the mount container.
