import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'
import { competitionConfigurationService } from '../services/competitionConfigurationService'
import { competitionService } from '../services/competitionService'
import { evaluationService } from '../services/evaluationService'
import { levelConfigurationService } from '../services/levelConfigurationService'
import { studentService } from '../services/studentService'
import { walletService } from '../services/walletService'
import { studentAuthenticationService } from '../services/studentAuthenticationService'
import { backendCompetitionService } from '../services/backendCompetitionService'

const StudentContext = createContext(null)
async function loadStudentState() {
  const realSession = await studentAuthenticationService.restoreSession()
  if (realSession) {
    if (!realSession.auth?.signedIn) return { ...realSession, competition: null, levelConfigurations: [], realSession: true }
    const requests = await Promise.allSettled([
      backendCompetitionService.getConfiguration(),
      backendCompetitionService.getLevelInfo(),
      backendCompetitionService.getActiveRound(),
      backendCompetitionService.getRoundHistory(),
      backendCompetitionService.getTransactions(),
      backendCompetitionService.getMyRank(),
    ])
    if (!studentAuthenticationService.hasRealSession && studentAuthenticationService.hasRealMode) {
      return { auth: { signedIn: false, mode: 'real' }, pendingIdentity: null, student: null, sessionExpired: true, competition: null, levelConfigurations: [], realSession: true }
    }
    const [configuration, levelInfo, activeRound, roundHistory, wallet, leaderboard] = requests.map(result => result.status === 'fulfilled' ? result.value : null)
    const dataErrors = Object.fromEntries(requests.map((result, index) => [
      ['configuration', 'levelInfo', 'activeRound', 'roundHistory', 'wallet', 'leaderboard'][index],
      result.status === 'rejected' ? result.reason : null,
    ]))
    const student = {
      ...realSession.student,
      competitionStatus: activeRound?.competitionStatus ?? realSession.student.competitionStatus,
      roundAvailability: activeRound?.roundAvailability ?? realSession.student.roundAvailability,
      walletBalance: levelInfo?.walletBalance ?? realSession.student.walletBalance,
      currentLevel: levelInfo?.currentLevel ?? realSession.student.currentLevel,
      ...(wallet ? { totalEarned: wallet.totalEarned, totalRisked: wallet.totalRisked, safeZoneAmount: wallet.safeZoneAmount } : {}),
    }
    return {
      ...realSession,
      student,
      competition: configuration,
      levelConfigurations: configuration?.levels || [],
      levelInfo,
      activeRound,
      roundHistory,
      wallet,
      leaderboard,
      dataErrors,
      realSession: true,
    }
  }
  const [session, profile, progress, wallet, evaluations, configuration, levelConfigurations] = await Promise.all([
    authService.getSession(), studentService.getProfile(), competitionService.getProgress(), walletService.getSummary(), evaluationService.getStatuses(),
    competitionConfigurationService.getConfiguration(), levelConfigurationService.getLevels(),
  ])
  const student = profile && progress && wallet ? {
    ...profile,
    ...progress,
    competitionStatus: progress.status,
    walletBalance: wallet.balance,
    totalEarned: wallet.totalRewardsEarned,
    totalEntryFeesPaid: wallet.totalEntryFeesPaid,
    evaluationStatuses: evaluations,
  } : null
  return { ...session, student, competition: configuration, levelConfigurations, realSession: false }
}

export function StudentProvider({ children }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const refresh = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try { const next = await loadStudentState(); setState(next); return next }
    catch (error) { setLoadError(error); throw error }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh().catch(() => {}) }, [refresh])
  useEffect(() => {
    const handleUnauthorized = () => { refresh().catch(() => {}) }
    window.addEventListener('code-buddy:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('code-buddy:unauthorized', handleUnauthorized)
  }, [refresh])
  return <StudentContext.Provider value={{ state, loading, loadError, refresh }}>{children}</StudentContext.Provider>
}
export function useStudent() { const context = useContext(StudentContext); if (!context) throw new Error('useStudent requires StudentProvider'); return context }
