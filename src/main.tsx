import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { isSupabaseConfigured } from "./lib/supabase-config";

const root = document.getElementById("root");

if (!root) {
  throw new Error("FlowWink root element was not found");
}

// Varje deploy byter chunkarnas hash-namn och Vercel serverar bara senaste
// byggets filer. En besökare med gamla appen laddad klickar på en länk →
// gamla chunknamnet 404:ar → lata routen faller till appens 404-sida tills
// hen refreshar för hand (optic-användarnas rapport 2026-08-28). Vite
// signalerar exakt detta via vite:preloadError — ladda om EN gång så hämtas
// nya skalet; sessionStorage-vakten stoppar loopar om felet inte är stale-
// deploy (t.ex. nät nere), och rensas vid lyckad laddning.
window.addEventListener("vite:preloadError", (event) => {
  const GUARD = "flowwink-chunk-reload";
  let alreadyTried = false;
  try { alreadyTried = sessionStorage.getItem(GUARD) === "1"; } catch { /* private mode */ }
  if (alreadyTried) return; // låt appens vanliga felväg ta över
  try { sessionStorage.setItem(GUARD, "1"); } catch { /* private mode */ }
  event.preventDefault();
  window.location.reload();
});
// Nollställ vakten först när appen bevisat ÖVERLEVT omladdningen en stund —
// rensning direkt vid boot hade öppnat loopdörren igen (boot sker ju direkt
// efter reloaden, före ett eventuellt nytt preload-fel).
setTimeout(() => {
  try { sessionStorage.removeItem("flowwink-chunk-reload"); } catch { /* private mode */ }
}, 10_000);

// The Supabase client throws at MODULE LOAD when the env vars are unset, so a
// misconfigured deploy white-screens with no error. Gate on config first, and
// only THEN dynamically import the app — a static import of App would pull in
// the throwing client before this check could run. An unconfigured instance
// gets a legible "connect your backend" page instead of a blank tab.
if (!isSupabaseConfigured()) {
  import("./pages/ConfigureEnvironment").then(({ ConfigureEnvironment }) => {
    createRoot(root).render(<ConfigureEnvironment />);
  });
} else {
  Promise.all([
    import("./App.tsx"),
    import("./lib/visitor-chat-session"),
  ]).then(([{ default: App }, { applyVisitorChatSessionHeader }]) => {
    // Bind visitor chat session header so RLS on chat_conversations/chat_messages
    // only returns rows belonging to this browser.
    applyVisitorChatSessionHeader();

    // StrictMode is a development-only mirror: it mounts, unmounts and remounts
    // every component once, so an effect that is not safe to run twice fails
    // here instead of in front of a customer. Production renders exactly once.
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
