import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyVisitorChatSessionHeader } from "./lib/visitor-chat-session";

// Bind visitor chat session header so RLS on chat_conversations/chat_messages
// only returns rows belonging to this browser.
applyVisitorChatSessionHeader();

const root = document.getElementById("root");

if (!root) {
  throw new Error("FlowWink root element was not found");
}

// StrictMode is a development-only mirror: it mounts, unmounts and remounts
// every component once, so an effect that is not safe to run twice fails here
// instead of in front of a customer. Production renders exactly once.
//
// Checked before enabling it: usePageViewTracker sets its `tracked` ref
// synchronously before the first await, so the second mount bails and no page
// view is counted twice.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
