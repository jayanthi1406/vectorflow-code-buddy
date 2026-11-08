import { DEMO_COMPETITION_CONFIGURATION } from '../data/demoCompetition'

const clone = value => structuredClone(value)
export const competitionConfigurationService = {
  async getConfiguration() { return { ...clone(DEMO_COMPETITION_CONFIGURATION), source: 'demo' } },
}
