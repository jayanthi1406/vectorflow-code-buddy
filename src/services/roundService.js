import { readMockState, getMockRound, writeMockState } from './mockStore'
import { levelConfigurationService } from './levelConfigurationService'
import { competitionConfigurationService } from './competitionConfigurationService'
import { formatCurrency } from '../utils/formatters'
export const roundService = {
  async getRound() { return getMockRound(readMockState().student) },
  async enterRound() {
    const state = readMockState()
    if (!state.auth?.signedIn || !state.student) throw new Error('Sign in to enter the round.')
    if (state.student.roundAvailability !== 'ready') throw new Error('This round is not available yet.')
    const level = await levelConfigurationService.getLevel(state.student.currentLevel)
    if (!level) throw new Error('This level is not present in the active competition configuration.')
    if (state.student.walletBalance < level.entryStake) {
      const configuration = await competitionConfigurationService.getConfiguration()
      throw new Error(`A ${formatCurrency(level.entryStake, configuration.currency, configuration.locale)} entry stake is required for this level. Your balance has not changed.`)
    }
    const next = { ...state, student: { ...state.student, roundAvailability: 'inProgress', roundEntered: true } }
    writeMockState(next)
    return next
  },
}
