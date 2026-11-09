import { useState } from "react";
import { OpsHubEnvMark, OpsHubLogo } from "../ui-lib/OpsHubLogo";
import { MSym } from "../ui/msym";
import { readThemeMode, setThemeMode, type ThemeMode } from "../theme-mode";

// Global platform top bar — Eos Library "Opshub bar" Overlay / INT-NFT /
// Default (Figma 449:15626). Overlay is the in-app variant: lockup left,
// utilities right, no Apps / Admin tools tabs (those belong to Dock, the
// OpsHub app-chooser). Iceberg product nav stays on the rail below.
export function TopBar() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode);
  const next: ThemeMode = mode === "dark" ? "light" : "dark";

  return (
    <header className="ui-topbar">
      <div className="ui-topbar__brand">
        <OpsHubLogo size={24} />
        <span className="ui-topbar__brand-name">OpsHub</span>
      </div>

      <div className="ui-topbar__utils">
        <button
          type="button"
          className="ui-topbar__icon-btn ui-topbar__theme"
          aria-label={`Switch to ${next} theme`}
          title={`Switch to ${next} theme`}
          onClick={() => {
            setThemeMode(next);
            setMode(next);
          }}
        >
          <MSym name={mode === "dark" ? "light_mode" : "dark_mode"} size={20} />
        </button>

        <button
          type="button"
          className="ui-topbar__env"
          aria-label="Environment: Streamly INT-NFT"
        >
          <OpsHubEnvMark className="ui-topbar__env-chip" />
          <span className="ui-topbar__env-label">Streamly: INT-NFT</span>
          <MSym name="keyboard_arrow_down" size={18} />
        </button>

        <button
          type="button"
          className="ui-topbar__icon-btn"
          aria-label="App menu"
        >
          <MSym name="apps" size={24} />
        </button>

        <button
          type="button"
          className="ui-topbar__icon-btn ui-topbar__account"
          aria-label="Account"
        >
          <MSym name="account_circle" size={24} filled />
        </button>
      </div>
    </header>
  );
}
