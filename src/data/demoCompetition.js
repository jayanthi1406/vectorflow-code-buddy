// DEMO DATA ONLY. Official competition settings and assignments come from the backend.
export const DEMO_COMPETITION_CONFIGURATION = {
  id: 'vvce-code-sprint-2026',
  name: 'VVCE Code Sprint 2026',
  currency: 'INR',
  locale: 'en-IN',
  questionsPerRound: 1,
  roundDurationSeconds: 180,
  supportedLanguages: ['C', 'C++', 'Java', 'Python'],
  levels: [
    { number: 1, name: 'Level 1', entryFee: 0, passReward: 50, failPayout: 50, safeZoneAmount: 50, isSafeZone: true },
    { number: 2, name: 'Level 2', entryFee: 50, passReward: 100, failPayout: 50, safeZoneAmount: 0, isSafeZone: false },
    { number: 3, name: 'Level 3', entryFee: 100, passReward: 150, failPayout: 50, safeZoneAmount: 0, isSafeZone: false },
    { number: 4, name: 'Level 4', entryFee: 150, passReward: 250, failPayout: 50, safeZoneAmount: 250, isSafeZone: true },
    { number: 5, name: 'Level 5', entryFee: 0, passReward: 350, failPayout: 250, safeZoneAmount: 0, isSafeZone: false },
    { number: 6, name: 'Level 6', entryFee: 100, passReward: 500, failPayout: 250, safeZoneAmount: 0, isSafeZone: false, isFinal: true },
  ],
}

const question = (id, levelNumber, difficulty, title, statement, constraints, inputFormat, outputFormat, examples) => ({
  id, levelNumber, difficulty, title, statement, constraints, inputFormat, outputFormat, examples,
})

// Six stable demo assignments for each difficulty. These are fixtures, not a live question bank.
export const DEMO_QUESTION_BANK = [
  question('easy-l1-01', 1, 'EASY', 'Balanced Brackets', 'Given a string containing only (, ), {, }, [ and ], determine whether the brackets are balanced. Every opening bracket must have a matching closing bracket of the same type, in the correct order. Return YES when balanced and NO otherwise.', ['1 ≤ string length ≤ 10⁴', 'The string contains only bracket characters.'], 'A single string of brackets.', 'Print YES if the brackets are balanced; otherwise print NO.', [{ id: 'sample-1', input: '({[]})', output: 'YES' }, { id: 'sample-2', input: '([)]', output: 'NO' }]),
  question('easy-l2-01', 2, 'EASY', 'Second Largest Number', 'Given a list of integers, print the second largest distinct value. If no such value exists, print NONE.', ['1 ≤ n ≤ 10⁴', '−10⁹ ≤ each value ≤ 10⁹'], 'The first line contains n. The second line contains n integers.', 'Print the second largest distinct value, or NONE.', [{ id: 'sample-1', input: '5\n4 8 8 2 6', output: '6' }]),
  question('easy-l3-01', 3, 'EASY', 'Rotate an Array', 'Rotate an array to the right by k positions. Values that move past the end continue from the beginning.', ['1 ≤ n ≤ 10⁴', '0 ≤ k ≤ 10⁹'], 'The first line contains n and k. The second line contains n integers.', 'Print the rotated array on one line.', [{ id: 'sample-1', input: '5 2\n1 2 3 4 5', output: '4 5 1 2 3' }]),
  question('easy-l4-01', 4, 'EASY', 'First Non-Repeating Character', 'Given a string, find the first character that appears exactly once. Print NONE if every character repeats.', ['1 ≤ string length ≤ 10⁴', 'The input contains lowercase English letters.'], 'A single line containing the string.', 'Print the first non-repeating character, or NONE.', [{ id: 'sample-1', input: 'swiss', output: 'w' }]),
  question('easy-l5-01', 5, 'EASY', 'Merge Sorted Lists', 'Given two sorted integer lists, merge them into one sorted list.', ['1 ≤ n, m ≤ 10⁴', 'Each input list is sorted in non-decreasing order.'], 'The first line contains n and m. The next two lines contain the lists.', 'Print all n + m values in sorted order.', [{ id: 'sample-1', input: '3 3\n1 4 7\n2 3 8', output: '1 2 3 4 7 8' }]),
  question('easy-l6-01', 6, 'EASY', 'Longest Increasing Run', 'Find the length of the longest contiguous strictly increasing run in an integer array.', ['1 ≤ n ≤ 10⁵', '−10⁹ ≤ each value ≤ 10⁹'], 'The first line contains n. The second line contains n integers.', 'Print the length of the longest increasing run.', [{ id: 'sample-1', input: '7\n1 2 2 3 4 0 5', output: '3' }]),
  question('hard-l1-01', 1, 'HARD', 'Shortest Path in a Grid', 'Given an n × m grid of 0s and 1s, find the shortest path length from the top-left to the bottom-right cell. Move up, down, left, or right. A cell containing 1 is blocked.', ['1 ≤ n, m ≤ 500', 'The starting and destination cells are open.'], 'The first line contains n and m, followed by n rows of m values.', 'Print the number of visited cells in a shortest path, or -1 if none exists.', [{ id: 'sample-1', input: '3 3\n0 0 0\n1 1 0\n0 0 0', output: '5' }]),
  question('hard-l2-01', 2, 'HARD', 'Minimum Meeting Rooms', 'Given meeting start and end times, find the minimum number of rooms required so that no meetings in a room overlap.', ['1 ≤ n ≤ 2 × 10⁵', '0 ≤ start < end ≤ 10⁹'], 'The first line contains n. Each following line contains a start and end time.', 'Print the minimum number of rooms required.', [{ id: 'sample-1', input: '3\n0 30\n5 10\n15 20', output: '2' }]),
  question('hard-l3-01', 3, 'HARD', 'Count Islands', 'In a binary grid, count groups of connected 1 cells. Cells connect horizontally or vertically, not diagonally.', ['1 ≤ n, m ≤ 500', 'Grid values are 0 or 1.'], 'The first line contains n and m, followed by n rows of m values.', 'Print the number of islands.', [{ id: 'sample-1', input: '3 4\n1 1 0 0\n0 1 0 1\n0 0 0 1', output: '2' }]),
  question('hard-l4-01', 4, 'HARD', 'Longest Unique Substring', 'Given a string, find the length of its longest substring containing no repeated characters.', ['0 ≤ string length ≤ 2 × 10⁵'], 'A single line containing the string.', 'Print the maximum length.', [{ id: 'sample-1', input: 'abcabcbb', output: '3' }]),
  question('hard-l5-01', 5, 'HARD', 'Top K Frequent Values', 'Given an integer array and k, return the k values with the highest frequency. Break ties by smaller numeric value first.', ['1 ≤ n ≤ 2 × 10⁵', '1 ≤ k ≤ number of distinct values'], 'The first line contains n and k. The second line contains n integers.', 'Print the selected values in the required order.', [{ id: 'sample-1', input: '6 2\n4 4 1 1 1 2', output: '1 4' }]),
  question('hard-l6-01', 6, 'HARD', 'Shortest Transformation Sequence', 'Given a start word, a target word, and a dictionary, find the fewest single-letter changes needed to reach the target. Every intermediate word must be in the dictionary.', ['1 ≤ dictionary size ≤ 5000', 'All words have equal length.'], 'The first line contains start and target. The second line contains n, followed by n words.', 'Print the minimum number of transformations, or 0 if unreachable.', [{ id: 'sample-1', input: 'cold warm\n4\ncord card ward warm', output: '4' }]),
]

export const DEMO_COMPETITION_RECORDS = [
  { participantName: 'Ravi Kiran', recordType: 'highestLevel', value: 4, achievedAt: '2026-10-24T13:10:00+05:30' },
  { participantName: 'Megha Kulkarni', recordType: 'highestLevel', value: 5, achievedAt: '2026-10-26T14:40:00+05:30' },
  { participantName: 'Vivek Hegde', recordType: 'highestLevel', value: 5, achievedAt: '2026-10-26T15:10:00+05:30' },
  { participantName: 'Isha Patil', recordType: 'highestEarnings', value: 700, achievedAt: '2026-10-27T11:15:00+05:30' },
  { participantName: 'Arjun Rao', recordType: 'highestEarnings', value: 600, achievedAt: '2026-10-25T16:00:00+05:30' },
]
