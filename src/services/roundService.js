import { readMockState, getMockRound, writeMockState, ensureMockAssignment } from './mockStore'
import { levelConfigurationService } from './levelConfigurationService'
import { competitionConfigurationService } from './competitionConfigurationService'
import { formatCurrency } from '../utils/formatters'
export const roundService = {
  async getRound() { return getMockRound(readMockState().student) },
  async enterRound() {
    const state = readMockState()
    if (!state.auth?.signedIn || !state.student) throw new Error('Sign in to enter the round.')
    if (state.student.roundAvailability !== 'ready') throw new Error('This round is not available yet.')
    if (state.student.currentLevel > (state.student.levelsCleared ?? 0) + 1) throw new Error('Clear the previous level before entering this round.')
    const level = await levelConfigurationService.getLevel(state.student.currentLevel)
    if (!level) throw new Error('This level is not present in the active competition configuration.')
    if (state.student.walletBalance < level.entryFee) {
      const configuration = await competitionConfigurationService.getConfiguration()
      throw new Error(`A ${formatCurrency(level.entryFee, configuration.currency, configuration.locale)} entry fee is required for this level. Your balance has not changed.`)
    }
    const { state: assignedState, questions } = ensureMockAssignment(state)
    if (questions.length !== 1) throw new Error('A demo question assignment is unavailable for this year and level.')
    const next = { ...assignedState, student: { ...assignedState.student, roundAvailability: 'inProgress', roundEntered: true } }
    writeMockState(next)
    return next
  },
}
