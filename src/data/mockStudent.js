// DEMO DATA ONLY. These local identities never represent authenticated VVCE students.
export const demoAccounts = [
  { name: 'Ananya Rao', email: 'ananya.rao@vvce.ac.in', usn: '4VV23CS042', year: '3rd Year', registered: true },
  { name: 'Kavya Shetty', email: 'kavya.shetty@vvce.ac.in', usn: '', year: '', registered: false },
  { name: 'Nikhil Dev', email: 'nikhil.dev@vvce.ac.in', usn: '4VV23CS091', year: '2nd Year', registered: true, walletBalance: 49 },
  { name: 'Rohan Bhat', email: 'rohan.bhat@gmail.com', usn: '', year: '', registered: false },
]

export const defaultStudent = {
  name: 'Ananya Rao', usn: '4VV23CS042', email: 'ananya.rao@vvce.ac.in', year: '3rd Year',
  currentLevel: 2, highestLevel: 1, levelsCleared: 1, walletBalance: 100,
  totalEarned: 50, totalEntryFeesPaid: 0, competitionStatus: 'In progress',
  roundAvailability: 'ready',
}

export const outcomeCopy = {
  cleared: { eyebrow: 'Level cleared', title: 'A new level unlocked.', body: 'Your assigned question passed. Your next level becomes available when the competition system opens it.' },
  pending: { eyebrow: 'Evaluation pending', title: 'Your solution is with the volunteer.', body: 'Evaluation is read-only here. Your volunteer will update the question status after the walkthrough.' },
  eliminated: { eyebrow: 'Competition update', title: 'Your run ends here.', body: 'Failing the assigned question or reaching the timer deadline means immediate elimination. There are no retries.' },
  completed: { eyebrow: 'Competition complete', title: 'You made it to the end.', body: 'You have completed the final level. A run worth remembering.' },
  insufficient: { eyebrow: 'Wallet update', title: 'Not quite enough to enter.', body: 'Your available balance is below the configured entry risk for this level. You are not eliminated and no fee is charged.' },
}
