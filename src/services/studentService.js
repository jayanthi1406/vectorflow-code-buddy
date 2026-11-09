import { readMockState } from './mockStore'
import { normalizeStudentProfile } from './normalizers'
export const studentService = { async getProfile() { return normalizeStudentProfile(readMockState().student) } }
