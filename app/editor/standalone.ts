/** Running as the installed home-screen app (not a browser tab)? Its cookies are separate from Safari's on iOS. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
}
