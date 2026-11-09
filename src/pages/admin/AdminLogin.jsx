import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Brand } from "../../components/ui";
import "./admin-login.css";

export default function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setError(
      "Backend authentication integration is pending. Please try again after configuration."
    );
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-brand">
        <Brand />
      </div>

      <div className="admin-login-card">
        <div className="admin-login-icon">
          <LockKeyhole size={25} />
        </div>

        <span className="admin-login-eyebrow">ADMIN PORTAL</span>
        <h1>Welcome back</h1>
        <p className="admin-login-subtitle">
          Sign in to manage the Code Buddy competition.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email address</label>

          <div className="admin-login-input">
            <Mail size={17} />
            <input
              id="admin-email"
              type="email"
              placeholder="Enter your admin email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
            />
          </div>

          <label htmlFor="admin-password">Password</label>

          <div className="admin-login-input">
            <LockKeyhole size={17} />
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
            <button
              type="button"
              className="admin-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && <p className="admin-login-error">{error}</p>}

          <button type="submit" className="admin-login-submit">
            Sign in
          </button>
        </form>

        <p className="admin-login-footer">
          Restricted access · Authorised administrators only
        </p>
      </div>
    </div>
  );
}