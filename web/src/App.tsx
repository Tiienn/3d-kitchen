import { useEffect, useState } from "react";
import { KitchenScene } from "./components/KitchenScene";
import { Panel } from "./components/Panel";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { useConfigurator } from "./store/useConfigurator";
import { buildShareUrl } from "./lib/share";
import { capturePng } from "./lib/snapshot";

function useActiveName(): string {
  const projects = useConfigurator((s) => s.projects);
  const activeProjectId = useConfigurator((s) => s.activeProjectId);
  const sharedMode = useConfigurator((s) => s.sharedMode);
  const sharedName = useConfigurator((s) => s.sharedName);
  if (sharedMode) return sharedName || "Shared kitchen";
  return projects.find((p) => p.id === activeProjectId)?.name || "Kitchen";
}

export default function App() {
  const placeholderMode = useConfigurator((s) => s.placeholderMode);
  const selections = useConfigurator((s) => s.selections);
  const lightMode = useConfigurator((s) => s.lightMode);
  const sharedMode = useConfigurator((s) => s.sharedMode);
  const showToast = useConfigurator((s) => s.showToast);
  const clearToast = useConfigurator((s) => s.clearToast);
  const toast = useConfigurator((s) => s.toast);
  const name = useActiveName();

  // Mobile drawer state (ignored by CSS on desktop, where both are in-flow).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const closeDrawers = () => {
    setSidebarOpen(false);
    setPanelOpen(false);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 2200);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  const onShare = async () => {
    const url = buildShareUrl({ v: 1, name, selections, lightMode });
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
    } catch {
      // Clipboard blocked (e.g. non-secure context): reflect the link in the URL.
      window.location.hash = url.split("#")[1] ?? "";
      showToast("Link ready in address bar");
    }
  };

  const onSnapshot = () => {
    const ok = capturePng(name);
    showToast(ok ? "Snapshot saved" : "Snapshot unavailable");
  };

  return (
    <div className="app">
      <header className="header">
        {/* Mobile-only hamburger to open the projects drawer (owner mode only). */}
        {!sharedMode && (
          <button
            type="button"
            className="header-hamburger"
            title="Projects"
            aria-label="Open projects"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
        )}
        <h1 className="header-title">Kitchen Studio — Configurator</h1>
        <span className="header-project">{name}</span>
        {placeholderMode && (
          <span className="header-note">Demo geometry — Blender model pending</span>
        )}
        <div className="header-actions">
          {/* Viewers already have the link; hide "Share link" in shared mode. */}
          {!sharedMode && (
            <button type="button" className="toolbar-button" onClick={onShare}>
              Share link
            </button>
          )}
          <button type="button" className="toolbar-button" onClick={onSnapshot}>
            Save PNG
          </button>
        </div>
      </header>

      {sharedMode && (
        <div className="share-banner">
          <span>Viewing shared design{name ? ` — ${name}` : ""}</span>
        </div>
      )}

      <main className="stage">
        {/* Project management is owner-only; viewers of a share link never see it. */}
        {!sharedMode && (
          <div className={`sidebar-drawer${sidebarOpen ? " is-open" : ""}`}>
            <ProjectSidebar onCloseMobile={() => setSidebarOpen(false)} />
          </div>
        )}

        <div className="canvas-wrap">
          <KitchenScene />
        </div>

        <div className={`panel-drawer${panelOpen ? " is-open" : ""}`}>
          <Panel onCloseMobile={() => setPanelOpen(false)} />
        </div>

        {/* Dimmed scrim: closes any open drawer on tap. Mobile-only via CSS. */}
        {(sidebarOpen || panelOpen) && (
          <div className="scrim" onClick={closeDrawers} aria-hidden="true" />
        )}

        {/* Floating thumb-reachable trigger for the customize drawer (mobile-only). */}
        {!panelOpen && (
          <button
            type="button"
            className="customize-fab"
            onClick={() => setPanelOpen(true)}
          >
            Customize
          </button>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
