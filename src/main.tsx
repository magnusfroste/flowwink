import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { isSupabaseConfigured } from "./lib/supabase-config";

const root = document.getElementById("root");

if (!root) {
  throw new Error("FlowWink root element was not found");
}

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
