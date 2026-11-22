import { readMockState } from './mockStore'
import { normalizeStudentProfile } from './normalizers'
export const competitionService = {
  async getProgress() {
    const student = normalizeStudentProfile(readMockState().student)
    return student ? {
      currentLevel: student.currentLevel,
      highestLevel: student.highestLevel,
      highestLevelReached: student.highestLevelReached,
      levelsCleared: student.levelsCleared,
      status: student.competitionStatus,
      roundAvailability: student.roundAvailability,
      roundEntered: student.roundEntered,
    } : null
  },
}
