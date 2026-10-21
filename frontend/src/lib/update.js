// Gym&Me has no publishing destination yet. Keep the API shape stable for callers, but make
// every check deterministic and offline so this derivative never queries or installs upstream.
export const UPDATES_CONFIGURED = false
const noUpdate = () => ({ hasUpdate: false, latestVersion: __APP_VERSION__, apkUrl: null, hashUrl: null })
export function resetUpdateCheck() {}
export async function checkForUpdate() { return noUpdate() }

/**
 * Computes the SHA-256 hash of an ArrayBuffer using the Web Crypto API.
 * Returns the hex-encoded digest string.
 */
export async function sha256(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Always refuses to install an update until Gym&Me publishing is configured.
 * The parameters remain only to preserve the existing caller API.
 *
 * @param {string} url - Direct download URL for the APK
 * @param {string|null} expectedHash - Expected SHA-256 hex string (from .sha256 asset), or null to skip verification
 * @param {function|null} onProgress - Called with (received, total) bytes during download, or null
 */
export async function downloadAndInstall(url, expectedHash = null, onProgress = null) {
  throw new Error('Gym&Me updates are not configured yet')
}
