import { useState } from "react";
import { Droplets, Eye, EyeOff } from "lucide-react";
import { useStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { useTypewriter } from "../lib/useTypewriter";
import Swal from "sweetalert2";

export default function Login() {
  const { dispatch } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const phrases = [
    "Every bar.\nEvery box.\nEvery client.",
    "Track stock\nin real time.",
    "Manage your\nmarketing agents.",
    "Simplify your\ndaily operations.",
    "Generate reports\nin one click.",
  ];
  const headline = useTypewriter(phrases, 55, 30, 1400);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !data.user) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      setError(
        "No profile found for this account. Ask your manager to set one up.",
      );
      setLoading(false);
      return;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      setLoading(false);
      Swal.fire({
        icon: "error",
        title: "Account deactivated",
        text: "Your account has been deactivated. Contact your manager for access.",
        confirmButtonColor: "#2E9E8F",
      });
      return;
    }

    await supabase
      .from("auth_logs")
      .insert({ user_id: profile.id, event: "login" });

    dispatch({
      type: "SET_USER",
      payload: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        phone: profile.phone,
      },
    });

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 40%, #2E9E8F 0%, transparent 60%),
                              radial-gradient(circle at 80% 80%, #D99A3D 0%, transparent 50%)`,
          }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-[var(--radius)] bg-primary flex items-center justify-center">
              <Droplets size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">SoapFlow</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4 min-h-[9rem]">
              {headline}
              <span className="animate-pulse">|</span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed max-w-xs">
              A complete management system for soap manufacturing and
              distribution — built for the team that keeps Rwanda clean.
            </p>
          </div>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { label: "Active Clients", value: "12+" },
            { label: "Stock Units", value: "660" },
            { label: "Agents", value: "5" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/5 border border-white/10 rounded-[var(--radius)] p-4"
            >
              <div className="text-2xl font-bold text-white mb-1">
                {stat.value}
              </div>
              <div className="text-white/40 text-xs">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-1">
              Welcome back
            </h2>
            <p className="text-muted text-sm">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@soapflow.rw"
                required
                className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted uppercase tracking-wide block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-[var(--radius)] bg-card text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-[var(--radius-sm)] px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-semibold py-2.5 rounded-[var(--radius)] hover:bg-primary/90 transition-colors text-sm disabled:opacity-60 mt-2"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* <div className="mt-8 p-4 bg-card border border-border rounded-[var(--radius)] space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Demo accounts
            </p>
            <div className="space-y-1.5">
              {Object.entries(DEMO_ACCOUNTS).map(([email, user]) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => {
                    setEmail(email);
                    setPassword("soapflow2025");
                  }}
                  className="w-full text-left px-3 py-2 rounded-[var(--radius-sm)] hover:bg-border/40 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-medium text-foreground">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-muted">{email}</div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      user.role === "manager"
                        ? "bg-primary/10 text-primary"
                        : "bg-secondary/10 text-secondary"
                    }`}
                  >
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted/70 mt-2">
              Password: <span className="font-mono">soapflow2025</span>
            </p>
          </div> */}
        </div>
      </div>
    </div>
  );
}
