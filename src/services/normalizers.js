// Pure boundary adapters for backend models. Original backend fields are retained
// through object spreading so callers can inspect server values without losing them.
export function normalizeStudentProfile(profile) {
  if (!profile) return profile
  return {
    ...profile,
    highestLevel: profile.highestLevelReached ?? profile.highestLevel ?? 1,
    // Keep the backend's financial names intact; totalRisked is not silently
    // re-labelled as entry fees paid until the backend defines that accounting.
  }
}

export function normalizeCompetitionLevel(level) {
  if (!level) return level
  return {
    ...level,
    entryFee: level.entryRiskAmount !== undefined ? level.entryRiskAmount : level.entryFee ?? level.entryStake ?? null,
    passReward: level.winningPayout !== undefined ? level.winningPayout : level.passReward ?? level.reward ?? null,
  }
}

export function normalizeCompetitionConfiguration(configuration) {
  if (!configuration) return configuration
  return {
    ...configuration,
    levels: Array.isArray(configuration.levels)
      ? configuration.levels.map(normalizeCompetitionLevel)
      : [],
  }
}
