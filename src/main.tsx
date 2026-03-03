import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.info("[boot] main.tsx evaluated");
createRoot(document.getElementById("root")!).render(<App />);
