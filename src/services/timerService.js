import { readMockState } from './mockStore'
import { competitionConfigurationService } from './competitionConfigurationService'
export const timerService = {
  async getTimerInformation() {
    const configuration = await competitionConfigurationService.getConfiguration()
    const student = readMockState().student
    return { durationSeconds: configuration.roundDurationSeconds, officialStartTime: null, deadline: null, extensions: [], status: student?.roundAvailability || 'unavailable', authority: 'backend-and-volunteer' }
  },
}
