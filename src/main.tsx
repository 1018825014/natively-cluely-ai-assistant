import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { initUiLocalization } from "./lib/uiLocalization"

// Initialize Theme
if (window.electronAPI && window.electronAPI.getThemeMode) {
  window.electronAPI.getThemeMode().then(({ resolved }) => {
    document.documentElement.setAttribute('data-theme', resolved);
  });

  // Listen for changes
  window.electronAPI.onThemeChanged(({ resolved }) => {
    document.documentElement.setAttribute('data-theme', resolved);
  });
}

initUiLocalization();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
