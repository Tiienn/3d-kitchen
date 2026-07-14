import { useState } from "react";
import { FINISH_SLOTS } from "../config/finishes";
import { useConfigurator, type CameraPresetId } from "../store/useConfigurator";

const CAMERA_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sink", label: "Sink" },
  { id: "island", label: "Island" },
  { id: "range", label: "Range" },
];

export function Panel({ onCloseMobile }: { onCloseMobile?: () => void }) {
  const selections = useConfigurator((s) => s.selections);
  const setSelection = useConfigurator((s) => s.setSelection);
  const cameraPreset = useConfigurator((s) => s.cameraPreset);
  const setCameraPreset = useConfigurator((s) => s.setCameraPreset);
  const lightMode = useConfigurator((s) => s.lightMode);
  const setLightMode = useConfigurator((s) => s.setLightMode);

  // All finish sections start open; user can collapse to reduce scrolling.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  return (
    <aside className="panel">
      {/* Mobile-only drawer header with a close affordance. */}
      <div className="drawer-head">
        <span className="drawer-title">Customize</span>
        <button
          type="button"
          className="drawer-close"
          title="Close"
          aria-label="Close customize panel"
          onClick={onCloseMobile}
        >
          ✕
        </button>
      </div>

      <section className="panel-section">
        <h2 className="panel-heading">Views</h2>
        <div className="view-buttons">
          {CAMERA_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`view-button${cameraPreset === p.id ? " is-active" : ""}`}
              onClick={() => setCameraPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <h2 className="panel-heading">Lighting</h2>
        <div className="light-toggle">
          <button
            type="button"
            className={`light-button${lightMode === "day" ? " is-active" : ""}`}
            onClick={() => setLightMode("day")}
          >
            ☀ Day
          </button>
          <button
            type="button"
            className={`light-button${lightMode === "evening" ? " is-active" : ""}`}
            onClick={() => setLightMode("evening")}
          >
            ☾ Evening
          </button>
        </div>
      </section>

      {FINISH_SLOTS.map((slot) => {
        const isCollapsed = collapsed[slot.id];
        const activeOpt = slot.options.find((o) => o.id === selections[slot.id]);
        return (
          <section key={slot.id} className="panel-section">
            <button
              type="button"
              className="panel-heading panel-heading-toggle"
              onClick={() => toggle(slot.id)}
              aria-expanded={!isCollapsed}
            >
              <span>{slot.label}</span>
              <span className="panel-heading-meta">
                {activeOpt?.label}
                <span className="chevron">{isCollapsed ? "▸" : "▾"}</span>
              </span>
            </button>
            {!isCollapsed && (
              <div className="swatches">
                {slot.options.map((opt) => {
                  const active = selections[slot.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`swatch${active ? " is-active" : ""}`}
                      onClick={() => setSelection(slot.id, opt.id)}
                      title={opt.label}
                      aria-pressed={active}
                    >
                      <span
                        className="swatch-chip"
                        style={{ backgroundColor: opt.swatch }}
                      />
                      <span className="swatch-label">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </aside>
  );
}
