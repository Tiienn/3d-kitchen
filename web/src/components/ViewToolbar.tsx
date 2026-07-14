import { useEffect, useState } from "react";
import { useConfigurator } from "../store/useConfigurator";
import { getCameraApi } from "../lib/viewBridge";

/** Cross-browser fullscreen helpers (Safari uses the webkit-prefixed API). */
type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function isFullscreen(): boolean {
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

async function toggleFullscreen(): Promise<void> {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  if (isFullscreen()) {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } else {
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  }
}

/**
 * Floating tools overlaid on the top-left of the canvas: the 2D/3D segmented
 * control plus fit, fullscreen and measure. Available in every mode (incl.
 * shared) — these are viewing tools. On mobile it stays top-left but compacts
 * to icons (labels hidden via CSS).
 */
export function ViewToolbar() {
  const viewMode = useConfigurator((s) => s.viewMode);
  const setViewMode = useConfigurator((s) => s.setViewMode);
  const measureMode = useConfigurator((s) => s.measureMode);
  const toggleMeasureMode = useConfigurator((s) => s.toggleMeasureMode);

  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onChange = () => setFs(isFullscreen());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    onChange();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  return (
    <div className="view-toolbar">
      {/* 2D / 3D segmented control. */}
      <div className="seg" role="group" aria-label="View mode">
        <button
          type="button"
          className={`seg-btn${viewMode === "2d" ? " is-active" : ""}`}
          aria-pressed={viewMode === "2d"}
          onClick={() => setViewMode("2d")}
        >
          2D
        </button>
        <button
          type="button"
          className={`seg-btn${viewMode === "3d" ? " is-active" : ""}`}
          aria-pressed={viewMode === "3d"}
          onClick={() => setViewMode("3d")}
        >
          3D
        </button>
      </div>

      {/* Fit / re-centre. */}
      <button
        type="button"
        className="tool-icon"
        title={viewMode === "2d" ? "Fit plan to view" : "Re-centre (overview)"}
        aria-label="Fit view"
        onClick={() => getCameraApi()?.fit()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Measure tool. */}
      <button
        type="button"
        className={`tool-icon${measureMode ? " is-active" : ""}`}
        title="Measure"
        aria-label="Measure tool"
        aria-pressed={measureMode}
        onClick={toggleMeasureMode}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M3 8.5 8.5 3 21 15.5 15.5 21 3 8.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M7 9.5l1.5 1.5M10 6.5l1.5 1.5M13 9.5l1.5 1.5M16 6.5l1.5 1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Fullscreen. */}
      <button
        type="button"
        className={`tool-icon${fs ? " is-active" : ""}`}
        title={fs ? "Exit fullscreen" : "Fullscreen"}
        aria-label="Toggle fullscreen"
        aria-pressed={fs}
        onClick={() => void toggleFullscreen()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          {fs ? (
            <path
              d="M9 4v5H4M20 9h-5V4M4 15h5v5M15 20v-5h5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </button>
    </div>
  );
}
