// DEMO DATA ONLY. Production competition settings and question assignments come from backend services.
export const DEMO_COMPETITION_CONFIGURATION = {
  id: 'vvce-code-sprint-2026',
  name: 'VVCE Code Sprint 2026',
  currency: 'INR',
  locale: 'en-IN',
  questionsPerRound: 2,
  roundDurationSeconds: 180,
  supportedLanguages: ['C', 'C++', 'Java', 'Python'],
  levels: [
    { number: 1, name: 'Level 1', entryStake: 0, reward: 100 },
    { number: 2, name: 'Level 2', entryStake: 100, reward: 100 },
    { number: 3, name: 'Level 3', entryStake: 100, reward: 100 },
    { number: 4, name: 'Level 4', entryStake: 100, reward: 100 },
    { number: 5, name: 'Final level', entryStake: 100, reward: 100 },
  ],
}

export const DEMO_ASSIGNED_QUESTIONS = [
  {
    id: 'easy-01', title: 'Balanced Brackets', difficulty: 'Easy',
    statement: 'Given a string containing only the characters (, ), {, }, [ and ], determine whether the brackets are balanced. Every opening bracket must have a matching closing bracket of the same type, in the correct order.\n\nReturn YES when the string is balanced and NO otherwise.',
    constraints: ['1 ≤ length of string ≤ 10⁴', 'The string contains only (, ), {, }, [ and ].'],
    examples: [
      { id: 'sample-1', input: '({[]})', output: 'YES' },
      { id: 'sample-2', input: '([)]', output: 'NO' },
    ],
  },
  {
    id: 'hard-02', title: 'Shortest Path in a Grid', difficulty: 'Hard',
    statement: 'Given an n × m grid of 0s and 1s, find the length of the shortest path from the top-left to the bottom-right cell. You may move up, down, left or right. A cell containing 1 is blocked.',
    constraints: ['1 ≤ n, m ≤ 500', 'The starting and destination cells are always open.'],
    examples: [{ id: 'sample-1', input: '3 3\n0 0 0\n1 1 0\n0 0 0', output: '5' }],
  },
]

export const DEMO_COMPETITION_RECORDS = [
  { participantName: 'Ravi Kiran', recordType: 'highestLevel', value: 4, achievedAt: '2026-10-24T13:10:00+05:30' },
  { participantName: 'Megha Kulkarni', recordType: 'highestLevel', value: 5, achievedAt: '2026-10-26T14:40:00+05:30' },
  { participantName: 'Vivek Hegde', recordType: 'highestLevel', value: 5, achievedAt: '2026-10-26T15:10:00+05:30' },
  { participantName: 'Isha Patil', recordType: 'highestEarnings', value: 700, achievedAt: '2026-10-27T11:15:00+05:30' },
  { participantName: 'Arjun Rao', recordType: 'highestEarnings', value: 600, achievedAt: '2026-10-25T16:00:00+05:30' },
]
