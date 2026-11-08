import { readMockState } from './mockStore'
export const evaluationService = { async getStatuses() { return readMockState().student?.evaluationStatuses || { easy: 'Pending', hard: 'Pending' } } }
