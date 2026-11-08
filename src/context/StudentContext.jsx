import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'
import { competitionConfigurationService } from '../services/competitionConfigurationService'
import { competitionService } from '../services/competitionService'
import { evaluationService } from '../services/evaluationService'
import { levelConfigurationService } from '../services/levelConfigurationService'
import { studentService } from '../services/studentService'
import { walletService } from '../services/walletService'

const StudentContext = createContext(null)
async function loadStudentState() {
  const [session, profile, progress, wallet, evaluations, configuration, levelConfigurations] = await Promise.all([
    authService.getSession(), studentService.getProfile(), competitionService.getProgress(), walletService.getSummary(), evaluationService.getStatuses(),
    competitionConfigurationService.getConfiguration(), levelConfigurationService.getLevels(),
  ])
  const student = profile ? {
    ...profile,
    ...progress,
    competitionStatus: progress.status,
    walletBalance: wallet.balance,
    totalEarned: wallet.totalRewardsEarned,
    totalRisked: wallet.totalRisked,
    evaluationStatuses: evaluations,
  } : null
  return { ...session, student, competition: configuration, levelConfigurations }
}

export function StudentProvider({ children }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { loadStudentState().then(setState).finally(() => setLoading(false)) }, [])
  const refresh = useCallback(async () => { const next = await loadStudentState(); setState(next); return next }, [])
  return <StudentContext.Provider value={{ state, loading, refresh }}>{children}</StudentContext.Provider>
}
export function useStudent() { const context = useContext(StudentContext); if (!context) throw new Error('useStudent requires StudentProvider'); return context }
