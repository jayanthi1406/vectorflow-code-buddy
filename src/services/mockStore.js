import { defaultStudent, demoAccounts } from '../data/mockStudent'
import { DEMO_ASSIGNED_QUESTIONS, DEMO_COMPETITION_CONFIGURATION, DEMO_COMPETITION_RECORDS } from '../data/demoCompetition'

const KEY = 'code-buddy-student-demo-v2'
const fresh = () => ({ auth: { signedIn: false, mode: null }, student: null, pendingIdentity: null, registrations: demoAccounts.filter(item => item.registered).map(({ name, email, usn, year }) => ({ name, email, usn, year })) })
export function readMockState() {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') } }
  catch { return fresh() }
}
export function writeMockState(state) { localStorage.setItem(KEY, JSON.stringify(state)); return state }
export function resetMockState() { localStorage.removeItem(KEY); return fresh() }
export const mockProfileFor = (profile) => ({ ...defaultStudent, roundEntered: false, ...profile, evaluationStatuses: Object.fromEntries(DEMO_ASSIGNED_QUESTIONS.map(question => [question.id, 'Pending'])) })
export const getMockRound = (student) => ({
  status: student?.roundAvailability || 'unavailable', level: student?.currentLevel ?? null,
  officialStartTime: null, deadline: null, timerExtensions: [],
})
export const getMockAssignedQuestions = (student) => student?.roundEntered ? structuredClone(DEMO_ASSIGNED_QUESTIONS) : []
export const getMockRecords = () => {
  const tieSort = (a, b) => b.value - a.value || new Date(a.achievedAt) - new Date(b.achievedAt) || a.participantName.localeCompare(b.participantName)
  const highestConfiguredLevel = DEMO_COMPETITION_CONFIGURATION.levels.at(-1)?.number ?? 0
  return {
    highestRound: DEMO_COMPETITION_RECORDS.filter(item => item.recordType === 'highestLevel' && item.value <= highestConfiguredLevel).sort(tieSort)[0],
    highestEarnings: DEMO_COMPETITION_RECORDS.filter(item => item.recordType === 'highestEarnings').sort(tieSort)[0],
  }
}
