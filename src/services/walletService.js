import { readMockState } from './mockStore'
export const walletService = { async getSummary() { const student = readMockState().student; return student ? { balance: student.walletBalance, totalRewardsEarned: student.totalEarned, totalRisked: student.totalRisked, transactions: [] } : null } }
