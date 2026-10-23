// The backend runs on port 4000. Derive its host from the page host so the app
// works whether it was opened via localhost, 127.0.0.1, or a LAN address.
// "localhost" is mapped to 127.0.0.1 because the backend listens on IPv4 and
// some browsers try ::1 first.
const configured = process.env.NEXT_PUBLIC_API_URL?.trim();

function resolveApiBase(): string {
  if (configured && configured.length > 0) {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window === "undefined") return "http://127.0.0.1:4000";

  const pageHost = window.location.hostname;
  const apiHost =
    pageHost === "localhost" || pageHost === "::1" || pageHost === "[::1]"
      ? "127.0.0.1"
      : pageHost;

  return `${window.location.protocol}//${apiHost}:4000`;
}

export const API_BASE = resolveApiBase();
