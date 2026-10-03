import { AuthProvider, useAuth } from "./AuthProvider";
import { AuthScreen } from "./AuthScreen";
import { App } from "../App";
import { Card } from "../components";
export function AccountLoading({
  text = "Restoring your session…",
}: {
  text?: string;
}) {
  return (
    <div className="auth-shell">
      <Card className="auth-card account-loading">
        <img src="/assets/ashvi.png" alt="" />
        <h2>Ashvi</h2>
        <p role="status">{text}</p>
        <span className="loading-line" />
      </Card>
    </div>
  );
}
function Gate() {
  const auth = useAuth();
  if (auth.loading) return <AccountLoading />;
  if (!auth.user || auth.recovery)
    return <AuthScreen key={auth.recovery ? "reset" : "auth"} />;
  return <App key={auth.user.id} userId={auth.user.id} />;
}
export function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
