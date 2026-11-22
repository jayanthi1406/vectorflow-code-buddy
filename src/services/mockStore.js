import { defaultStudent, demoAccounts } from '../data/mockStudent'
import { DEMO_QUESTION_BANK, DEMO_COMPETITION_CONFIGURATION, DEMO_COMPETITION_RECORDS } from '../data/demoCompetition'

const KEY = 'code-buddy-student-demo-v2'
const fresh = () => ({ auth: { signedIn: false, mode: null }, student: null, pendingIdentity: null, registrations: demoAccounts.filter(item => item.registered).map(({ name, email, usn, year }) => ({ name, email, usn, year })) })
export function readMockState() {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') } }
  catch { return fresh() }
}
export function writeMockState(state) { localStorage.setItem(KEY, JSON.stringify(state)); return state }
export function resetMockState() { localStorage.removeItem(KEY); return fresh() }
export const mockProfileFor = (profile) => ({ ...defaultStudent, roundEntered: false, questionAssignments: {}, ...profile, evaluationStatuses: Object.fromEntries(DEMO_QUESTION_BANK.map(question => [question.id, 'Pending'])) })
export const getMockRound = (student) => ({
  status: student?.roundAvailability || 'unavailable', level: student?.currentLevel ?? null,
  officialStartTime: null, deadline: null, timerExtensions: [],
})
export const getDemoDifficultyForYear = (year) => year === '1st Year' ? 'EASY' : ['2nd Year', '3rd Year', '4th Year'].includes(year) ? 'HARD' : null

export function ensureMockAssignment(state, levelNumber = state?.student?.currentLevel) {
  const student = state?.student
  if (!student || !levelNumber) return { state, questions: [] }
  const key = String(levelNumber)
  const existing = student.questionAssignments?.[key]
  if (existing?.length === 1) return { state, questions: structuredClone(existing) }

  const difficulty = getDemoDifficultyForYear(student.year)
  const selected = DEMO_QUESTION_BANK.find(item => item.levelNumber === levelNumber && item.difficulty === difficulty)
  if (!selected) return { state, questions: [] }

  const questions = [structuredClone(selected)]
  const nextState = {
    ...state,
    student: {
      ...student,
      questionAssignments: { ...student.questionAssignments, [key]: questions },
    },
  }
  return { state: nextState, questions: structuredClone(questions) }
}

export const getMockAssignedQuestions = (student) => {
  if (!student?.roundEntered) return []
  const key = String(student.currentLevel)
  const assigned = student.questionAssignments?.[key]
  return Array.isArray(assigned) ? structuredClone(assigned) : []
}
export const getMockRecords = () => {
  const tieSort = (a, b) => b.value - a.value || new Date(a.achievedAt) - new Date(b.achievedAt) || a.participantName.localeCompare(b.participantName)
  const highestConfiguredLevel = DEMO_COMPETITION_CONFIGURATION.levels.at(-1)?.number ?? 0
  return {
    highestRound: DEMO_COMPETITION_RECORDS.filter(item => item.recordType === 'highestLevel' && item.value <= highestConfiguredLevel).sort(tieSort)[0],
    highestEarnings: DEMO_COMPETITION_RECORDS.filter(item => item.recordType === 'highestEarnings').sort(tieSort)[0],
  }
}
