import { readMockState, getMockAssignedQuestions } from './mockStore'
export const assignedQuestionService = { async getAssignedQuestions() { return { questions: getMockAssignedQuestions(readMockState().student), source: 'demo' } } }
