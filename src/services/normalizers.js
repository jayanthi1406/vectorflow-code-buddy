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
    failPayout: level.losingPayout !== undefined ? level.losingPayout : level.failPayout ?? null,
    durationSeconds: level.durationSeconds ?? null,
  }
}

export function normalizeCompetitionConfiguration(configuration) {
  if (!configuration) return configuration
  return {
    ...configuration,
    totalLevels: configuration.totalLevels ?? configuration.levels?.length ?? null,
    levels: Array.isArray(configuration.levels)
      ? configuration.levels.map(normalizeCompetitionLevel)
      : [],
  }
}

export function normalizeBackendRound(round) {
  if (!round) return round
  const question = round.question || {}
  return {
    ...round,
    question: {
      ...question,
      id: question.questionId ?? round.questionId ?? question.id ?? '',
      inputFormat: question.inputFormat ?? '',
      outputFormat: question.outputFormat ?? '',
      examples: Array.isArray(question.examples) ? question.examples : [],
    },
  }
}

export function normalizeCompetitionRecords(response) {
  if (!response) return response
  const levelRecord = response.highestRoundReached
  const earningsRecord = response.highestCumulativeEarnings
  return {
    ...response,
    highestRound: levelRecord ? {
      ...levelRecord,
      value: levelRecord.levelNumber,
      participantName: levelRecord.participantName,
    } : null,
    highestEarnings: earningsRecord ? {
      ...earningsRecord,
      value: earningsRecord.amount,
      participantName: earningsRecord.participantName,
    } : null,
  }
}
