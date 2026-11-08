import { useStudent } from '../context/StudentContext'
import { InlineTag, SectionHeading } from '../components/ui'

export default function ProfilePage() {
  const { state } = useStudent()
  const student = state.student
  return <div className="page profile-page"><SectionHeading kicker="Student account" title="My profile." detail="Your registered student details for this competition." action={<InlineTag tone="lime">Demo profile</InlineTag>} /><section className="profile-sheet"><div className="profile-avatar">{student.name.split(' ').map(part => part[0]).join('').slice(0,2)}</div><div className="profile-name"><h2>{student.name}</h2><span>VVCE student · {student.year}</span></div><dl className="profile-details"><div><dt>Full name</dt><dd>{student.name}</dd></div><div><dt>USN</dt><dd>{student.usn}</dd></div><div><dt>Verified VVCE email</dt><dd>{student.email}<span className="verified-label">Verified in demo</span></dd></div><div><dt>Year of study</dt><dd>{student.year}</dd></div></dl></section><p className="profile-note">In this local preview, profile details are demo data saved in your browser. In production, verified account details and registration will be confirmed by the backend.</p></div>
}
