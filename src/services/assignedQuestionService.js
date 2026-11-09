import { readMockState, getMockAssignedQuestions, ensureMockAssignment, writeMockState } from './mockStore'

export const assignedQuestionService = {
  async getAssignedQuestions() {
    const state = readMockState()
    let questions = getMockAssignedQuestions(state.student)
    if (state.student?.roundEntered && questions.length !== 1) {
      const assigned = ensureMockAssignment(state)
      questions = assigned.questions
      if (assigned.state !== state) writeMockState(assigned.state)
    }
    return { questions, source: 'demo' }
  },
}
