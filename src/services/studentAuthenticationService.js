import { apiClient, ApiError, API_ERROR_CODES } from './apiClient'
import { backendConfig } from './backendConfig'
import { normalizeStudentProfile } from './normalizers'

const TOKEN_KEY = 'code-buddy.auth.token'
const MODE_KEY = 'code-buddy.auth.mode'
let accessToken = null

apiClient.setAccessTokenProvider(() => accessToken)

function storage() {
  try { return window.sessionStorage } catch { return null }
}
function saveSession(token) {
  accessToken = token
  const store = storage()
  try { store?.setItem(TOKEN_KEY, token); store?.setItem(MODE_KEY, 'real') } catch { /* memory-only session remains usable */ }
  try { window.localStorage?.setItem(MODE_KEY, 'real') } catch { /* session storage remains the primary marker */ }
}
function clearToken() {
  accessToken = null
  try { storage()?.removeItem(TOKEN_KEY) } catch { /* storage may be unavailable */ }
}
function markRealMode() {
  try { storage()?.setItem(MODE_KEY, 'real') } catch { /* in-memory marker is sufficient until reload */ }
  try { window.localStorage?.setItem(MODE_KEY, 'real') } catch { /* non-sensitive marker only */ }
}
function clearMode() {
  try { storage()?.removeItem(MODE_KEY) } catch { /* ignore unavailable storage */ }
  try { window.localStorage?.removeItem(MODE_KEY) } catch { /* ignore unavailable storage */ }
}
function requireStudentResponse(response, withToken = false) {
  if (!response || response.success !== true || !response.student || typeof response.student !== 'object') {
    throw new ApiError('The authentication service returned an unexpected response.', API_ERROR_CODES.RESPONSE)
  }
  if (withToken ? typeof response.registrationComplete !== 'boolean' : typeof response.student.registrationComplete !== 'boolean') {
    throw new ApiError('The authentication service did not include the registration status.', API_ERROR_CODES.RESPONSE)
  }
  if (withToken && (typeof response.token !== 'string' || !response.token.trim())) {
    throw new ApiError('The authentication service did not return a session token.', API_ERROR_CODES.RESPONSE)
  }
  return response
}
function presentError(error) {
  if (error instanceof ApiError && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    clearToken()
    markRealMode()
  }
  return error
}

export const studentAuthenticationService = {
  get configured() { return Boolean(backendConfig.apiBaseUrl && backendConfig.googleClientId) },
  get hasRealSession() { return Boolean(accessToken || storedToken()) },
  get hasRealMode() {
    try { return storage()?.getItem(MODE_KEY) === 'real' || window.localStorage?.getItem(MODE_KEY) === 'real' } catch { return Boolean(accessToken) }
  },
  getAccessToken() { return accessToken || storedToken() },
  async startDemoMode() { clearToken(); clearMode() },
  async signInWithGoogle(idToken) {
    if (!backendConfig.apiBaseUrl) throw new ApiError('Backend API URL is not configured. Set VITE_API_BASE_URL.', API_ERROR_CODES.CONFIGURATION)
    if (!backendConfig.googleClientId) throw new ApiError('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID.', API_ERROR_CODES.CONFIGURATION)
    if (typeof idToken !== 'string' || !idToken.trim()) throw new ApiError('Google did not provide an ID token. Please try again.', API_ERROR_CODES.REQUEST)
    try {
      const response = requireStudentResponse(await apiClient.post('/api/auth/google', { idToken }), true)
      saveSession(response.token)
      const student = normalizeStudentProfile(response.student)
      const registrationComplete = response.registrationComplete
      return {
        auth: { signedIn: registrationComplete, mode: 'real' },
        pendingIdentity: registrationComplete ? null : student,
        student: registrationComplete ? student : null,
      }
    } catch (error) { throw presentError(error) }
  },
  async register({ usn, year }) {
    markRealMode()
    try {
      const response = await apiClient.post('/api/auth/register', { usn, year })
      requireStudentResponse(response)
      return response
    } catch (error) { throw presentError(error) }
  },
  async getProfile() {
    markRealMode()
    try {
      const response = requireStudentResponse(await apiClient.get('/api/auth/me'))
      const student = normalizeStudentProfile(response.student)
      return {
        auth: { signedIn: student.registrationComplete === true, mode: 'real' },
        pendingIdentity: student.registrationComplete ? null : student,
        student: student.registrationComplete ? student : null,
        profile: student,
      }
    } catch (error) { throw presentError(error) }
  },
  async restoreSession() {
    const token = storedToken()
    if (token) accessToken = token
    if (!token && !this.hasRealMode) return null
    if (!token) return { auth: { signedIn: false, mode: 'real' }, pendingIdentity: null, student: null, sessionExpired: true }
    try { return await this.getProfile() }
    catch (error) {
      if (error instanceof ApiError && error.code === API_ERROR_CODES.UNAUTHORIZED) {
        return { auth: { signedIn: false, mode: 'real' }, pendingIdentity: null, student: null, sessionExpired: true }
      }
      throw error
    }
  },
  async signOut() { clearToken(); clearMode() },
  async endExpiredSession() { clearToken(); markRealMode() },
  async useDemoMode() { clearToken(); clearMode() },
}

function storedToken() {
  try { return storage()?.getItem(TOKEN_KEY) || null } catch { return null }
}
