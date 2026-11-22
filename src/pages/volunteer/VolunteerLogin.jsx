import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import { Brand } from "../../components/ui";
import { loginVolunteer } from "../../services/volunteerAuthService";
import "./volunteer-login.css";

export default function VolunteerLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await loginVolunteer(username.trim(), password);
      navigate("/volunteer/dashboard", { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
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
          Sign in with your volunteer username to manage
          your assigned participants and evaluations.
        </p>

        <form onSubmit={handleLogin}>
          <div className="vol-login-field">
            <label htmlFor="vol-username">Username</label>

            <div className="vol-login-input">
              <UserRound size={18} />

              <input
                id="vol-username"
                type="text"
                placeholder="Enter your volunteer username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
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

          <button type="submit" className="vol-login-button" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
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
