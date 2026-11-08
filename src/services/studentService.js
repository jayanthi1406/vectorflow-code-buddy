import { readMockState } from './mockStore'
export const studentService = { async getProfile() { return readMockState().student } }
