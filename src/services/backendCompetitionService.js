import { apiClient, ApiError, API_ERROR_CODES } from './apiClient'
import { normalizeCompetitionConfiguration, normalizeCompetitionLevel, normalizeCompetitionRecords, normalizeBackendRound } from './normalizers'

const SUPPORTED_LANGUAGES = ['C', 'C++', 'Java', 'Python']

function requireSuccess(response, label) {
  if (!response || response.success !== true) {
    throw new ApiError(`The backend returned an unexpected ${label} response.`, API_ERROR_CODES.RESPONSE)
  }
  return response
}

function isMissingRound(error) {
  return error instanceof ApiError && error.status === 404 && error.responseBody?.code === 'ROUND_NOT_ALLOCATED'
}

export const backendCompetitionService = {
  async getConfiguration() {
    const response = requireSuccess(await apiClient.get('/api/competition/config'), 'competition configuration')
    const configuration = normalizeCompetitionConfiguration({
      ...response,
      currency: 'INR',
      locale: 'en-IN',
      supportedLanguages: SUPPORTED_LANGUAGES,
      questionsPerRound: 1,
    })
    if (configuration.totalLevels !== 6 || configuration.levels.length !== 6) {
      throw new ApiError('The backend competition configuration does not contain exactly six levels.', API_ERROR_CODES.RESPONSE, { responseBody: response })
    }
    return { ...configuration, name: 'Code Buddy', source: 'backend' }
  },

  async getLevelInfo() {
    const response = requireSuccess(await apiClient.get('/api/rounds/level-info'), 'current level')
    return {
      ...response,
      level: normalizeCompetitionLevel(response.level),
      source: 'backend',
    }
  },

  async allocateQuestion() {
    // This endpoint accepts no body and creates or returns the student's persistent assignment.
    const response = requireSuccess(await apiClient.post('/api/rounds/allocate'), 'question allocation')
    if (!response.round) throw new ApiError('The backend did not include the allocated round.', API_ERROR_CODES.RESPONSE)
    return { ...response, round: normalizeBackendRound(response.round), source: 'backend' }
  },

  async getActiveRound() {
    try {
      const response = requireSuccess(await apiClient.get('/api/rounds/active'), 'active round')
      if (!response.round) throw new ApiError('The backend did not include the active round details.', API_ERROR_CODES.RESPONSE)
      return { ...response, round: normalizeBackendRound(response.round), source: 'backend' }
    } catch (error) {
      if (isMissingRound(error)) return null
      throw error
    }
  },

  async getRoundHistory({ page = 1, limit = 20 } = {}) {
    const response = requireSuccess(await apiClient.get(`/api/student/rounds/history?page=${page}&limit=${limit}`), 'round history')
    return { ...response, rounds: (response.rounds || []).map(round => ({ ...normalizeBackendRound(round), evaluation: round.evaluation || null })), source: 'backend' }
  },

  async getMyRank() {
    return { ...requireSuccess(await apiClient.get('/api/leaderboard/me'), 'student competition position'), source: 'backend' }
  },

  async getTransactions({ page = 1, limit = 20 } = {}) {
    return { ...requireSuccess(await apiClient.get(`/api/student/transactions?page=${page}&limit=${limit}`), 'wallet transaction'), source: 'backend' }
  },

  async getRecords() {
    return normalizeCompetitionRecords(requireSuccess(await apiClient.get('/api/competition/records'), 'competition records'))
  },
}
