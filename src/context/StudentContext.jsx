import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'
import { competitionConfigurationService } from '../services/competitionConfigurationService'
import { competitionService } from '../services/competitionService'
import { evaluationService } from '../services/evaluationService'
import { levelConfigurationService } from '../services/levelConfigurationService'
import { studentService } from '../services/studentService'
import { walletService } from '../services/walletService'
import { studentAuthenticationService } from '../services/studentAuthenticationService'

const StudentContext = createContext(null)
async function loadStudentState() {
  const realSession = await studentAuthenticationService.restoreSession()
  if (realSession) return { ...realSession, competition: null, levelConfigurations: [], realSession: true }
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
  return <StudentContext.Provider value={{ state, loading, loadError, refresh }}>{children}</StudentContext.Provider>
}
export function useStudent() { const context = useContext(StudentContext); if (!context) throw new Error('useStudent requires StudentProvider'); return context }
