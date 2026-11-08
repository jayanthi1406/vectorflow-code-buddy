import { demoAccounts } from '../data/mockStudent'
import { readMockState, writeMockState, mockProfileFor, resetMockState } from './mockStore'

const domainAllowed = (email) => typeof email === 'string' && /^[^\s@]+@vvce\.ac\.in$/i.test(email)

export const authService = {
  async getSession() { const { auth, pendingIdentity } = readMockState(); return { auth, pendingIdentity } },
  async beginDemoSignIn(email) {
    if (!domainAllowed(email)) { const error = new Error('Use a verified Google account ending in @vvce.ac.in.'); error.code = 'INVALID_DOMAIN'; throw error }
    const account = demoAccounts.find(item => item.email.toLowerCase() === email.toLowerCase())
    if (!account) { const error = new Error('This demo account is not in the local preview. Choose one of the listed demo identities.'); error.code = 'UNKNOWN_DEMO_ACCOUNT'; throw error }
    const state = readMockState()
    if (account.registered) {
      const registration = state.registrations.find(item => item.email.toLowerCase() === account.email.toLowerCase()) || account
      return writeMockState({ ...state, auth: { signedIn: true, mode: 'demo' }, pendingIdentity: null, student: mockProfileFor({ ...account, ...registration }) })
    }
    return writeMockState({ ...state, auth: { signedIn: false, mode: null }, pendingIdentity: { name: account.name, email: account.email }, student: null })
  },
  async signOutDemo() { return resetMockState() },
  domainAllowed,
}

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'
let scriptPromise
export const googleAuthService = {
  getClientId() { return import.meta.env.VITE_GOOGLE_CLIENT_ID || '' },
  async mountButton(element, onResult) {
    const clientId = this.getClientId()
    if (!clientId || !element) return false
    if (!window.google?.accounts?.id) {
      scriptPromise ||= new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = GOOGLE_SCRIPT; script.async = true; script.defer = true
        script.onload = resolve; script.onerror = () => reject(new Error('Google sign-in could not load. Check your connection and try again.'))
        document.head.appendChild(script)
      })
      await scriptPromise
    }
    window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => onResult(credential) })
    window.google.accounts.id.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: Math.max(240, Math.min(360, element.clientWidth || 320)), logo_alignment: 'left' })
    return true
  },
  async inspectCredentialForUi(credential) {
    try {
      const payloadPart = credential.split('.')[1]
      const payload = JSON.parse(decodeURIComponent(escape(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')))))
      if (!authService.domainAllowed(payload.email)) throw Object.assign(new Error('Use a verified Google account ending in @vvce.ac.in.'), { code: 'INVALID_DOMAIN' })
      if (payload.email_verified !== true) throw Object.assign(new Error('Your Google email must be verified before you can continue.'), { code: 'UNVERIFIED_EMAIL' })
      throw Object.assign(new Error('Google returned your VVCE account, but backend ID-token verification is not connected yet. This preview will not sign you in.'), { code: 'BACKEND_VERIFICATION_PENDING' })
    } catch (error) {
      if (error.code) throw error
      throw Object.assign(new Error('Google sign-in returned an invalid credential. Please try again.'), { code: 'INVALID_CREDENTIAL' })
    }
  },
}
