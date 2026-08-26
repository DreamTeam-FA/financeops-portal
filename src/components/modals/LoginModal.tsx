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

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div
        className={`w-full max-w-sm ${
          isLight
            ? "bg-white text-slate-900 border-slate-200"
            : "bg-[#0d111a] text-white border-[#1a2235]"
        } border rounded-2xl shadow-2xl overflow-hidden`}
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
