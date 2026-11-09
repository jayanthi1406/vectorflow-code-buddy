import { useStudent } from '../context/StudentContext'
import { InlineTag, SectionHeading } from '../components/ui'

export default function ProfilePage() {
  const { state } = useStudent()
  const student = state.student
  const currentLevel = state.levelConfigurations?.find(level => level.number === student.currentLevel)
  const isDemo = state.auth?.mode === 'demo'
  const levelCount = state.competition?.levels?.length
  const currentLabel = isDemo ? currentLevel?.name : student.currentLevel ? `L${student.currentLevel}` : null
  return <div className="page profile-page"><SectionHeading kicker="Student account" title="My profile." detail="Your registered student details for this competition." action={<InlineTag tone="lime">{isDemo ? 'Demo profile' : 'Verified profile'}</InlineTag>} /><section className="profile-sheet"><div className="profile-avatar" aria-hidden="true">{student.name.split(' ').map(part => part[0]).join('').slice(0,2)}</div><div className="profile-name"><h2>{student.name}</h2><span>VVCE student · {student.year}</span></div><dl className="profile-details"><div><dt>Full name</dt><dd>{student.name}</dd></div><div><dt>USN</dt><dd>{student.usn}</dd></div><div><dt>Verified VVCE email</dt><dd>{student.email}<span className="verified-label">{isDemo ? 'Verified in demo' : 'Verified'}</span></dd></div><div><dt>Year of study</dt><dd>{student.year}</dd></div></dl></section><section className="profile-competition" aria-label="Competition standing"><div><span>Competition status</span><strong>{student.competitionStatus || 'Unavailable'}</strong></div><div><span>Current level</span><strong>{currentLabel || 'Unavailable'}</strong></div><div><span>Highest level reached</span><strong>{isDemo ? `${String(student.highestLevel).padStart(2, '0')} / ${String(levelCount || 0).padStart(2, '0')}` : student.highestLevel ? `L${student.highestLevel}` : 'Unavailable'}</strong></div></section><p className="profile-note">{isDemo ? 'In this local preview, profile details are demo data saved in your browser. In production, verified account details and registration will be confirmed by the backend.' : 'Verified student details are read-only.'}</p></div>
}
