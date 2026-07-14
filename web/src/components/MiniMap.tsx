import { useEffect, useRef, useState } from "react";
import { useConfigurator, type PlanRect } from "../store/useConfigurator";
import { getCameraApi, planCamera, ROOM } from "../lib/viewBridge";

// Fallback footprints (world metres, XZ) used when the glb exposes no matching
// nodes. Derived from the documented scene geometry.
const FALLBACK_SHAPES: PlanRect[] = [
  { x: -2.5, z: -2.1, w: 5.0, d: 0.62, kind: "cabinet" }, // back-wall run
  { x: -2.5, z: 0.85, w: 0.62, d: 0.92, kind: "fridge" }, // left-wall fridge
  { x: -0.05, z: 0.05, w: 1.2, d: 1.0, kind: "island" }, // island
  { x: 1.15, z: -2.1, w: 0.6, d: 0.6, kind: "range" }, // range (back wall)
  { x: -0.55, z: -2.1, w: 0.5, d: 0.55, kind: "sink" }, // sink (back wall)
];

const KIND_FILL: Record<PlanRect["kind"], string> = {
  cabinet: "#3f4650",
  island: "#5a4a33",
  fridge: "#455063",
  range: "#5e3d3d",
  sink: "#3a5257",
};

const VB_X = ROOM.minX;
const VB_Y = ROOM.minZ;
const VB_W = ROOM.maxX - ROOM.minX;
const VB_H = ROOM.maxZ - ROOM.minZ;
const MARGIN = 0.3; // click clamp inside the room (metres)

/**
 * Inset top-down navigator. Renders the room + footprints as SVG and overlays a
 * live camera indicator (dot + view wedge) updated imperatively via rAF (no
 * React re-render). Clicking (3D only) flies the camera to that plan point.
 */
export function MiniMap() {
  const storeShapes = useConfigurator((s) => s.planShapes);
  const viewMode = useConfigurator((s) => s.viewMode);
  const [collapsed, setCollapsed] = useState(false);

  const shapes = storeShapes.length > 0 ? storeShapes : FALLBACK_SHAPES;
  const indicatorRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Imperative per-frame update of the camera indicator (zero React churn).
  useEffect(() => {
    if (collapsed) return;
    let raf = 0;
    const tick = () => {
      const g = indicatorRef.current;
      if (g) {
        const deg = (planCamera.angle * 180) / Math.PI;
        g.setAttribute(
          "transform",
          `translate(${planCamera.x.toFixed(3)} ${planCamera.z.toFixed(3)}) rotate(${deg.toFixed(1)})`,
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [collapsed]);

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (viewMode !== "3d") return; // click-to-move is 3D only
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    let wx = VB_X + fx * VB_W;
    let wz = VB_Y + fy * VB_H;
    wx = Math.min(ROOM.maxX - MARGIN, Math.max(ROOM.minX + MARGIN, wx));
    wz = Math.min(ROOM.maxZ - MARGIN, Math.max(ROOM.minZ + MARGIN, wz));
    getCameraApi()?.moveTo(wx, wz);
  };

  return (
    <div className={`minimap${collapsed ? " is-collapsed" : ""}`}>
      <div className="minimap-head">
        <span className="minimap-title">Plan</span>
        <button
          type="button"
          className="minimap-toggle"
          aria-label={collapsed ? "Expand floor plan" : "Collapse floor plan"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▴" : "▾"}
        </button>
      </div>

      {!collapsed && (
        <svg
          ref={svgRef}
          className="minimap-svg"
          viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={onMapClick}
          role="img"
          aria-label="Kitchen floor plan navigator"
        >
          {/* Room outline. */}
          <rect
            x={VB_X}
            y={VB_Y}
            width={VB_W}
            height={VB_H}
            fill="#20242a"
            stroke="#4a515b"
            strokeWidth={0.05}
          />
          {/* Footprints. */}
          {shapes.map((s, i) => (
            <rect
              key={i}
              x={s.x}
              y={s.z}
              width={s.w}
              height={s.d}
              fill={KIND_FILL[s.kind]}
              stroke="#11131680"
              strokeWidth={0.02}
              rx={0.03}
            />
          ))}
          {/* Live camera indicator: wedge points along +x, rotated to heading. */}
          <g ref={indicatorRef}>
            <path
              d="M0 0 L0.95 -0.42 L0.95 0.42 Z"
              fill="#c8a06a"
              fillOpacity={0.35}
            />
            <circle r={0.11} fill="#e8b978" stroke="#1c1e22" strokeWidth={0.03} />
          </g>
        </svg>
      )}
    </div>
  );
}
