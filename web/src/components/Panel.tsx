import { FINISH_SLOTS } from "../config/finishes";
import { useConfigurator, type CameraPresetId } from "../store/useConfigurator";

const CAMERA_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sink", label: "Sink" },
  { id: "island", label: "Island" },
  { id: "range", label: "Range" },
];

export function Panel() {
  const selections = useConfigurator((s) => s.selections);
  const setSelection = useConfigurator((s) => s.setSelection);
  const cameraPreset = useConfigurator((s) => s.cameraPreset);
  const setCameraPreset = useConfigurator((s) => s.setCameraPreset);

  return (
    <aside className="panel">
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

      {FINISH_SLOTS.map((slot) => (
        <section key={slot.id} className="panel-section">
          <h2 className="panel-heading">{slot.label}</h2>
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
        </section>
      ))}
    </aside>
  );
}
