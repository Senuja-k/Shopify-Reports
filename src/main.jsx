import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Suppress noisy AbortError unhandled rejections (often triggered by tab switches/reloads).
window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const name = reason?.name || "";
  const message = String(reason?.message || "");
  if (name === "AbortError" || message.toLowerCase().includes("abort")) {
    event.preventDefault();
  }
});

createRoot(document.getElementById("root")).render(<App />);
