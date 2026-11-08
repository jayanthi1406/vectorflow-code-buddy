import { competitionConfigurationService } from './competitionConfigurationService'

export const levelConfigurationService = {
  async getLevels() { const configuration = await competitionConfigurationService.getConfiguration(); return configuration.levels },
  async getLevel(number) { const levels = await this.getLevels(); return levels.find(level => level.number === number) || null },
}
