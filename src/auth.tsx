import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { LogIn, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabaseRedirectUrl, isSupabaseConfigured, supabase } from "./supabaseClient";

type AuthState = {
  isHostedMode: boolean;
  isAllowlisted: boolean;
  loading: boolean;
  session: Session | null;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [isAllowlisted, setIsAllowlisted] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }
      if (error) {
        setAuthError(error.message);
      }
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAllowlisted(true);
      return;
    }

    if (!session) {
      setIsAllowlisted(false);
      return;
    }

    let active = true;
    setAllowlistLoading(true);
    void supabase.rpc("is_current_user_allowlisted").then(({ data, error }) => {
      if (!active) {
        return;
      }
      if (error) {
        setAuthError(error.message);
        setIsAllowlisted(false);
      } else {
        setIsAllowlisted(Boolean(data));
      }
      setAllowlistLoading(false);
    });

    return () => {
      active = false;
    };
  }, [session]);

  const value = useMemo<AuthState>(
    () => ({
      isHostedMode: isSupabaseConfigured,
      isAllowlisted,
      loading: loading || allowlistLoading,
      session,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      user: session?.user || null
    }),
    [allowlistLoading, isAllowlisted, loading, session]
  );

  if (!isSupabaseConfigured) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  if (loading || allowlistLoading) {
    return (
      <AuthContext.Provider value={value}>
        <AuthShell eyebrow="Preparing LifeTrac" title="Checking your session">
          <div className="auth-loader" />
        </AuthShell>
      </AuthContext.Provider>
    );
  }

  if (!session) {
    return (
      <AuthContext.Provider value={value}>
        <AuthShell eyebrow="LifeTrac hosted beta" title="Sign in to your private timeline">
          <p>Google sign-in keeps each tester in their own private workspace. Calendar access is connected later, only after you are inside the app.</p>
          {authError && <p className="auth-error">{authError}</p>}
          <button className="auth-primary" onClick={() => void signInWithGoogle(setAuthError)} type="button">
            <LogIn size={18} />
            Sign in with Google
          </button>
        </AuthShell>
      </AuthContext.Provider>
    );
  }

  if (!isAllowlisted) {
    return (
      <AuthContext.Provider value={value}>
        <AuthShell eyebrow="Invite required" title="You are not invited yet">
          <p>{session.user.email} is signed in, but this email is not on the LifeTrac tester allowlist.</p>
          {authError && <p className="auth-error">{authError}</p>}
          <button className="auth-secondary" onClick={() => void supabase.auth.signOut()} type="button">
            <LogOut size={18} />
            Sign out
          </button>
        </AuthShell>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function signInWithGoogle(setAuthError: (message: string | null) => void) {
  setAuthError(null);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getSupabaseRedirectUrl()
    }
  });

  if (error) {
    setAuthError(error.message);
  }
}

function AuthShell({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
  return (
    <main className="auth-shell">
      <AnimatePresence mode="wait">
        <motion.section
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="auth-card"
          exit={{ opacity: 0, scale: 0.98, y: 12 }}
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <p className="eyebrow">{eyebrow}</p>
          <h1>LifeTrac</h1>
          <h2>{title}</h2>
          {children}
        </motion.section>
      </AnimatePresence>
    </main>
  );
}
