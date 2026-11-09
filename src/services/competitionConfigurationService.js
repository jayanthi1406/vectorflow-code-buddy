import { DEMO_COMPETITION_CONFIGURATION } from '../data/demoCompetition'
import { normalizeCompetitionConfiguration } from './normalizers'

const clone = value => structuredClone(value)
export const competitionConfigurationService = {
  async getConfiguration() { return { ...normalizeCompetitionConfiguration(clone(DEMO_COMPETITION_CONFIGURATION)), source: 'demo' } },
}
