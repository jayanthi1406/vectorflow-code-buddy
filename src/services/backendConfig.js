// Public client configuration only. API route contracts are intentionally not assumed.
export const backendConfig = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, ''),
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
}
