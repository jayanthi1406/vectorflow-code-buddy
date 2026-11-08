import { demoAccounts } from '../data/mockStudent'
import { readMockState, writeMockState, mockProfileFor } from './mockStore'
import { authService } from './authService'

export const studentRegistrationService = {
  async register({ name, usn, year }) {
    const state = readMockState()
    const identity = state.pendingIdentity
    if (!identity || !authService.domainAllowed(identity.email)) throw new Error('A VVCE demo identity is required before registration.')
    const normalizedUsn = usn.trim().toUpperCase()
    if (!/^[A-Z0-9]{8,15}$/.test(normalizedUsn)) throw new Error('Enter a valid USN (8–15 letters or numbers).')
    if (!['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(year)) throw new Error('Choose your year of study.')
    const duplicateInSeed = demoAccounts.some(account => account.usn && account.usn.toUpperCase() === normalizedUsn && account.email.toLowerCase() !== identity.email.toLowerCase())
    const duplicateInRegistered = state.registrations.some(profile => profile.usn.toUpperCase() === normalizedUsn && profile.email.toLowerCase() !== identity.email.toLowerCase())
    if (duplicateInSeed || duplicateInRegistered) throw new Error('That USN is already registered. Check the number or contact competition support.')
    const student = mockProfileFor({ name: identity.name, email: identity.email, usn: normalizedUsn, year })
    const registrations = [...state.registrations.filter(profile => profile.email.toLowerCase() !== identity.email.toLowerCase()), { name: student.name, email: student.email, usn: student.usn, year: student.year }]
    return writeMockState({ ...state, registrations, pendingIdentity: null, student, auth: { signedIn: true, mode: 'demo' } })
  },
}
