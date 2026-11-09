import { useState } from "react";
import { Users, UserX, Trophy, Wallet, Activity } from "lucide-react";
import { SectionHeading, MetricCard } from "../../components/UI";

const initialStats = [
  {
    label: "Registered Students",
    value: "—",
    caption: "Awaiting backend data",
  },
  { label: "Active Participants", value: "—", caption: "Currently competing" },
  { label: "Eliminated", value: "—", caption: "Competition records" },
  { label: "Completed", value: "—", caption: "Finished all levels" },
];

export default function AdminDashboard() {
  const [stats] = useState(initialStats);

  return (
    <div className="admin-dashboard">
      <SectionHeading
        kicker="COMPETITION MANAGEMENT"
        title="Admin overview."
        detail="Monitor participants and manage the Code Buddy competition."
      />

      <div className="admin-welcome">
        <div>
          <span className="admin-eyebrow">VVCE CODE SPRINT</span>
          <h2>Competition control center.</h2>
          <p>Manage questions, levels, volunteers and participants.</p>
        </div>
        <Activity size={38} />
      </div>

      <SectionHeading
        kicker="LIVE STATISTICS"
        title="Competition at a glance."
        detail="Statistics will appear here once the backend is connected."
      />

      <div className="admin-stats-grid">
        {stats.map((item, index) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            caption={item.caption}
            accent={index === 0}
          />
        ))}
      </div>

      <SectionHeading
        kicker="QUICK ACCESS"
        title="Management shortcuts."
        detail="Navigate to the main competition management areas."
      />

      <div className="admin-quick-grid">
        {[
          {
            title: "Question Bank",
            detail: "Add and manage coding questions.",
            icon: Trophy,
          },
          {
            title: "Participants",
            detail: "View registered students.",
            icon: Users,
          },
          {
            title: "Volunteers",
            detail: "Manage volunteer accounts.",
            icon: UserX,
          },
          {
            title: "Wallet Records",
            detail: "Review competition transactions.",
            icon: Wallet,
          },
        ].map(({ title, detail, icon: Icon }) => (
          <article className="admin-quick-card" key={title}>
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
