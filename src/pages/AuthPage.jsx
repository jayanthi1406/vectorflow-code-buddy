import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Code2, ShieldCheck } from 'lucide-react'
import { useStudent } from '../context/StudentContext'
import { authService, googleAuthService } from '../services/authService'
import { studentRegistrationService } from '../services/studentRegistrationService'
import { studentAuthenticationService } from '../services/studentAuthenticationService'
import { Brand, Button, TrustNote } from '../components/ui'

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { state, refresh } = useStudent()
  const navigate = useNavigate()
  const buttonRef = useRef(null)
  const [form, setForm] = useState({ name: state.pendingIdentity?.name || '', usn: '', year: '' })
  const [error, setError] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [duplicateTest, setDuplicateTest] = useState(false)
  const [demoModeAvailable, setDemoModeAvailable] = useState(state.auth?.mode !== 'real')
  const clientId = googleAuthService.getClientId()

  const handleGoogleCredential = useCallback(async credential => {
    setError(''); setBusy(true)
    try {
      await studentAuthenticationService.signInWithGoogle(credential)
      const next = await refresh()
      if (next.auth?.mode !== 'real' || (!next.auth?.signedIn && !next.pendingIdentity)) {
        throw new Error(next.sessionExpired
          ? 'Your backend session expired. Sign in again to continue.'
          : 'The backend did not return a student profile. Please try again.')
      }
      setDemoModeAvailable(false)
      navigate(next.pendingIdentity ? '/register' : '/dashboard')
    } catch (authError) { setError(authError.message) }
    finally { setBusy(false) }
  }, [navigate, refresh])

  useEffect(() => {
    if (isRegister || !clientId || !buttonRef.current) return
    let mounted = true
    const controller = new AbortController()
    const registrationToken = Symbol('google-button-effect')
    setGoogleReady(false)
    googleAuthService.mountButton(buttonRef.current, handleGoogleCredential, { signal: controller.signal, registrationToken })
      .then(ready => { if (mounted) setGoogleReady(ready) })
      .catch(loadError => { if (mounted) setError(loadError.message) })
    return () => {
      mounted = false
      controller.abort()
      googleAuthService.clearButtonCallback(registrationToken)
    }
  }, [clientId, handleGoogleCredential, isRegister])

  if (state.auth?.signedIn) return <Navigate to="/dashboard" replace />
  if (isRegister && !state.pendingIdentity) return <Navigate to="/login" replace />

  const handleDemoIdentity = async email => {
    setError(''); setBusy(true)
    try {
      await studentAuthenticationService.useDemoMode()
      const next = await authService.beginDemoSignIn(email)
      await refresh()
      navigate(next.pendingIdentity ? '/register' : '/dashboard')
    } catch (authError) { setError(authError.message) }
    finally { setBusy(false) }
  }

  const submitRegistration = async event => {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const usn = form.usn.trim().toUpperCase()
      if (!/^[A-Z0-9]{8,15}$/.test(usn)) throw new Error('Enter a valid USN (8–15 letters or numbers).')
      if (!['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(form.year)) throw new Error('Choose your year of study.')

      if (state.auth?.mode === 'real') {
        const response = await studentAuthenticationService.register({ usn, year: form.year })
        if (response.student.registrationComplete !== true) {
          throw new Error('The backend did not confirm that registration is complete. Please try again.')
        }
      } else {
        await studentRegistrationService.register({ ...form, usn })
      }
      const next = await refresh()
      if (state.auth?.mode === 'real' && (next.auth?.signedIn !== true || next.student?.registrationComplete !== true)) {
        throw new Error(next.sessionExpired
          ? 'Your backend session expired. Sign in again to continue.'
          : 'Your registration was not confirmed by the backend. Please try again.')
      }
      navigate('/dashboard')
    } catch (registrationError) { setError(registrationError.message) }
    finally { setBusy(false) }
  }

  return <div className="auth-shell">
    <header className="auth-header"><Brand /><span>STUDENT PORTAL</span></header>
    <main className="auth-main">
      <section className="auth-card">
        <div className="auth-kicker"><span className="auth-icon"><Code2 size={19} /></span><span>VVCE · CODE BUDDY</span></div>
        <h1>{isRegister ? <>Your next chapter<br />starts here.</> : <>Welcome back,<br />problem solver.</>}</h1>
        <p className="auth-description">{isRegister ? 'Confirm your student registration details to get started.' : 'Sign in with your VVCE Google account to enter the competition.'}</p>
        {!isRegister && <>
          <p className="google-heading">CONTINUE WITH GOOGLE</p>
          {clientId ? <div className={`google-button-host${googleReady ? ' google-ready' : ''}`} aria-label="Continue with Google"><div ref={buttonRef} style={{ width: '100%' }} />{!googleReady && <button type="button" className="google-fallback" onClick={() => setError('Google sign-in is loading. Please try again in a moment.')} disabled={!clientId}><span className="google-g" aria-hidden="true">G</span>Continue with Google</button>}</div> : <button type="button" className="google-fallback" onClick={() => setError('Google OAuth is not configured for this preview. Add VITE_GOOGLE_CLIENT_ID and connect backend token verification before enabling real sign-in.')}><span className="google-g" aria-hidden="true">G</span>Continue with Google</button>}
          <p className="auth-domain-note">Use a verified Google account ending in <strong>@vvce.ac.in</strong>. The backend verifies your Google ID token before signing you in.</p>
          {state.sessionExpired && <p className="form-error auth-alert" role="status">Your backend session expired. Sign in again to continue.</p>}
          {demoModeAvailable ? <div className="demo-signin"><div className="demo-signin-title"><span className="demo-pip"/><strong>Try the local demo</strong></div><p>These preview identities do not authenticate with Google or the server.</p><button type="button" disabled={busy} onClick={() => handleDemoIdentity('ananya.rao@vvce.ac.in')}>Returning student <span>Ananya Rao</span><ArrowRight size={14}/></button><button type="button" disabled={busy} onClick={() => handleDemoIdentity('kavya.shetty@vvce.ac.in')}>First-time student <span>Kavya Shetty</span><ArrowRight size={14}/></button><button type="button" disabled={busy} onClick={() => handleDemoIdentity('nikhil.dev@vvce.ac.in')}>Insufficient balance <span>Nikhil Dev</span><ArrowRight size={14}/></button><button type="button" disabled={busy} onClick={() => handleDemoIdentity('rohan.bhat@gmail.com')}>Test other email domain <span>Blocked in demo</span><ArrowRight size={14}/></button></div> : <button type="button" className="duplicate-test" onClick={async () => { await studentAuthenticationService.useDemoMode(); await authService.signOutDemo(); await refresh(); setDemoModeAvailable(true) }}>Switch explicitly to local demo</button>}
        </>}
        {isRegister && <form onSubmit={submitRegistration} className="auth-form registration-form" noValidate>
          <label>Full name<span className="input-wrap"><input value={state.pendingIdentity?.name || ''} readOnly aria-readonly="true" /></span><small>Provided by your verified Google account; not editable.</small></label>
          <label>University seat number (USN)<span className="input-wrap"><input required autoComplete="off" value={form.usn} onChange={event => setForm({ ...form, usn: event.target.value.toUpperCase() })} placeholder="e.g. 4VV23CS051" aria-describedby={error ? 'form-error' : undefined}/></span></label>
          <label>VVCE Gmail address<span className="input-wrap"><input value={state.pendingIdentity?.email || ''} readOnly aria-readonly="true" /></span><small>Verified account detail; cannot be changed here.</small></label>
          <label>Year of study<select required value={form.year} onChange={event => setForm({ ...form, year: event.target.value })}><option value="" disabled>Select your year</option>{['1st Year','2nd Year','3rd Year','4th Year'].map(year => <option key={year}>{year}</option>)}</select></label>
          {error && <p id="form-error" className="form-error" role="alert">{error}</p>}
          <Button type="submit" variant="dark" className="auth-submit" disabled={busy}>{busy ? 'Saving registration…' : 'Complete registration'}<ArrowRight size={17} /></Button>
          {state.auth?.mode === 'demo' && <button type="button" className="duplicate-test" onClick={() => { setForm({ ...form, usn: duplicateTest ? '4VV23CS051' : '4VV23CS042' }); setDuplicateTest(!duplicateTest); setError('') }}>{duplicateTest ? 'Use a new demo USN' : 'Test duplicate USN validation'}</button>}
        </form>}
        {!isRegister && error && <p className="form-error auth-alert" role="alert">{error}</p>}
        {!isRegister && <TrustNote>Demo sign-in is separate from Google OAuth. Real access is granted only after backend verification.</TrustNote>}
        {isRegister && <div className="auth-switch">Already registered? <button type="button" onClick={async () => { if (state.auth?.mode === 'real') await studentAuthenticationService.signOut(); else await authService.signOutDemo(); await refresh(); navigate('/login') }}>Back to sign in <ArrowRight size={13}/></button></div>}
      </section>
      <aside className="auth-aside"><span className="aside-toplabel">THINK CLEAR. SOLVE WELL.</span><div className="auth-aside-art"><span>if (idea) {'{'}</span><span className="aside-code-indent">keep_thinking();</span><span>{'}'}</span><span className="aside-code-cursor" /></div><div className="auth-aside-bottom"><span>01 — 05</span><p>Big ideas begin with a<br />single line of code.</p></div></aside>
    </main>
    <footer className="auth-footer"><span>Code Buddy · VVCE</span><span><ShieldCheck size={14} /> Student access</span></footer>
  </div>
}
