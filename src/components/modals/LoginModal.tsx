import React, { useState } from "react";
import { useFinance } from "../../context/FinanceContext";
import { googleSignInRedirect } from "../../services/googleAuth";
import { Shield, LogIn } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen }) => {
  const { handleGoogleSignIn, theme } = useFinance();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRedirect, setShowRedirect] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      setLoadingGoogle(true);
      setErrorMsg(null);
      setShowRedirect(false);
      await handleGoogleSignIn();
    } catch (err: any) {
      console.error("Google login error:", err);
      const code = err?.code || "";
      if (code === "auth/unauthorized-domain") {
        setErrorMsg(
          "This domain isn't authorized in Firebase. Add 'localhost' under Firebase Console → Authentication → Settings → Authorized domains."
        );
      } else if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request") {
        setErrorMsg("Popup was blocked by your browser.");
        setShowRedirect(true);
      } else {
        setErrorMsg("Google sign-in failed. Please try again.");
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleGoogleRedirect = async () => {
    try {
      await googleSignInRedirect();
    } catch {
      setErrorMsg("Redirect sign-in failed. Please try again.");
    }
  };

  const isLight = theme === "light";

  const LOGOS = [
    { src: "/logos/rubys.png",      alt: "Ruby's"      },
    { src: "/logos/msdx.png",       alt: "MSDx"        },
    { src: "/logos/ti.png",         alt: "TI"          },
    { src: "/logos/4yr.png",        alt: "4You Pros"   },
    { src: "/logos/curcuminpro.jpg",alt: "CurcuminPro" },
    { src: "/logos/ziglar.jpg",     alt: "Ziglar"      },
  ];
  const ORBIT_DUR = 14; // seconds per full revolution
  const ORBIT_R   = 160; // px, large enough to encircle the modal

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-fadeIn overflow-hidden"
         style={{ background: "linear-gradient(180deg,#0e2040 0%,#0c1a2e 50%,#091626 100%)" }}>

      {/* ── Grid overlay ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 75%)",
      }} />

      {/* ── Radial glow behind modal ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 55% 55% at 50% 50%,rgba(26,115,232,.18) 0%,transparent 70%)",
      }} />

      {/* ── Orbit stage (centred, behind modal card) ── */}
      <style>{`
        @keyframes lm-orbit-spin    { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
        @keyframes lm-orbit-counter { from { transform: translateX(${ORBIT_R}px) rotate(0deg);   }
                                      to   { transform: translateX(${ORBIT_R}px) rotate(-360deg); } }
        @keyframes lm-track-pulse   { 0%,100%{border-color:rgba(100,160,255,.14)}50%{border-color:rgba(100,160,255,.28)} }
      `}</style>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 0, height: 0, pointerEvents: "none" }}>
        {/* Dashed orbit track */}
        <div style={{
          position: "absolute",
          top: -ORBIT_R - 24, left: -ORBIT_R - 24,
          width: (ORBIT_R + 24) * 2, height: (ORBIT_R + 24) * 2,
          borderRadius: "50%",
          border: "1px dashed rgba(100,160,255,.18)",
          animation: "lm-track-pulse 4s ease-in-out infinite",
        }} />
        {/* Orbiting logo badges */}
        {LOGOS.map((logo, i) => (
          <div key={logo.alt} style={{
            position: "absolute", top: 0, left: 0, width: 0, height: 0,
            animation: `lm-orbit-spin ${ORBIT_DUR}s linear infinite`,
            animationDelay: `${-(ORBIT_DUR / LOGOS.length) * i}s`,
          }}>
            <div style={{
              position: "absolute",
              top: -24, left: -24,
              width: 48, height: 48,
              borderRadius: 13,
              background: "#eef1f8",
              padding: 5,
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.2)",
              animation: `lm-orbit-counter ${ORBIT_DUR}s linear infinite`,
              animationDelay: `${-(ORBIT_DUR / LOGOS.length) * i}s`,
            }}>
              <img src={logo.src} alt={logo.alt} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8, display: "block" }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal card ── */}
      <div
        className={`relative z-10 w-full max-w-sm ${
          isLight
            ? "bg-white/95 text-slate-900 border-slate-200"
            : "bg-[#0d111a]/95 text-white border-[#1a2235]"
        } border rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm`}
      >
        {/* Accent bar — portal blue */}
        <div className="h-1.5 w-full bg-[#1a73e8]" />
        <div className="p-6 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-[#1a73e8]/10 text-[#1a73e8] border border-[#1a73e8]/20 mb-1">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">Finance Overview Access</h2>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-[#888]"}`}>
            Sign in with your authorized Google account to access the dashboard.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs text-center font-medium space-y-1.5">
            <p>{errorMsg}</p>
            {showRedirect && (
              <button
                onClick={handleGoogleRedirect}
                className="underline text-[#1a73e8] font-bold"
              >
                Try Sign-In via Redirect instead
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loadingGoogle}
          className="w-full py-3 px-4 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 disabled:opacity-50 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          {loadingGoogle ? "Signing in…" : "Sign In with Google Account"}
        </button>

        <p className={`text-[10px] text-center ${isLight ? "text-slate-400" : "text-[#555]"}`}>
          Only authorized <strong>@marktimm.com</strong> Google accounts are permitted.
        </p>
      </div>
      </div>{/* end p-6 wrapper */}
    </div>
  );
};
