import { useEffect } from "react";
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
  const saveSharedAsProject = useConfigurator((s) => s.saveSharedAsProject);
  const showToast = useConfigurator((s) => s.showToast);
  const clearToast = useConfigurator((s) => s.clearToast);
  const toast = useConfigurator((s) => s.toast);
  const name = useActiveName();

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
        <h1 className="header-title">Kitchen Studio — Configurator</h1>
        <span className="header-project">{name}</span>
        {placeholderMode && (
          <span className="header-note">Demo geometry — Blender model pending</span>
        )}
        <div className="header-actions">
          <button type="button" className="toolbar-button" onClick={onShare}>
            Share link
          </button>
          <button type="button" className="toolbar-button" onClick={onSnapshot}>
            Save PNG
          </button>
        </div>
      </header>

      {sharedMode && (
        <div className="share-banner">
          <span>Viewing shared design</span>
          <button
            type="button"
            className="mini-button"
            onClick={saveSharedAsProject}
          >
            Save as project
          </button>
        </div>
      )}

      <main className="stage">
        <ProjectSidebar />
        <div className="canvas-wrap">
          <KitchenScene />
        </div>
        <Panel />
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
