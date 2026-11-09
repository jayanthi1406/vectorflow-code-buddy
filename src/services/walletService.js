import { readMockState } from './mockStore'
export const walletService = {
  async getSummary() {
    const student = readMockState().student
    return student ? {
      balance: student.walletBalance,
      totalRewardsEarned: student.totalEarned,
      totalEntryFeesPaid: student.totalEntryFeesPaid ?? student.totalRisked ?? 0,
      totalRisked: student.totalRisked ?? student.totalEntryFeesPaid ?? 0,
      transactions: [],
      source: 'demo',
    } : null
  },
}
