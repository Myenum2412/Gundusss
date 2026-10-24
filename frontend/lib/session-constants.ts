// Shared constant that both client and server code can import. The cookie is a
// UI gate only: the backend verifies the signed Bearer token on every request.
export const SESSION_COOKIE = "fees_session"
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60
