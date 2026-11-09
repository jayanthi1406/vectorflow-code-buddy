import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  UserRound,
} from "lucide-react";
import { Brand } from "../../components/ui";
import "./volunteer-login.css";

export default function VolunteerLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    const vvceEmailPattern = /^[a-zA-Z0-9._%+-]+@vvce\.ac\.in$/;

    if (!vvceEmailPattern.test(normalizedEmail)) {
      setError("Please use your official VVCE email (@vvce.ac.in).");
      return;
    }

    setError("");

    // Temporary frontend demo navigation.
    // Actual email and password verification will be handled by the backend.
    navigate("/volunteer/dashboard");
  };

  return (
    <div className="vol-login-page">
      <div className="vol-login-brand">
        <Brand />
      </div>

      <div className="vol-login-card">
        <div className="vol-login-icon">
          <UserRound size={25} />
        </div>

        <p className="vol-login-eyebrow">VOLUNTEER PORTAL</p>

        <h1>Welcome back</h1>

        <p className="vol-login-description">
          Sign in using your official VVCE email to manage
          your assigned participants and evaluations.
        </p>

        <form onSubmit={handleLogin}>
          <div className="vol-login-field">
            <label htmlFor="vol-email">VVCE Email Address</label>

            <div className="vol-login-input">
              <Mail size={18} />

              <input
                id="vol-email"
                type="email"
                placeholder="yourname@vvce.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="vol-login-field">
            <label htmlFor="vol-password">Password</label>

            <div className="vol-login-input">
              <LockKeyhole size={18} />

              <input
                id="vol-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="vol-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? (
                  <EyeOff size={17} />
                ) : (
                  <Eye size={17} />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="vol-login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="vol-login-button">
            Sign In
          </button>
        </form>

        <p className="vol-login-footer">
          Login credentials are provided by the competition administrator.
        </p>
      </div>

      <p className="vol-login-bottom">
        CODE BUDDY 2.0 · VOLUNTEER ACCESS
      </p>
    </div>
  );
}