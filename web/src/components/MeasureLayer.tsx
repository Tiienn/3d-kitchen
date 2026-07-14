import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import { useConfigurator } from "../store/useConfigurator";

/** One finished measurement between two world-space points. */
type Segment = { id: number; a: THREE.Vector3; b: THREE.Vector3 };

const MAX_SEGMENTS = 5;
const DRAG_PX = 6; // pointer travel above which a gesture is an orbit, not a click
const MARKERS_GROUP = "MEASURE_markers";

function formatDist(a: THREE.Vector3, b: THREE.Vector3): string {
  const m = a.distanceTo(b);
  return `${m.toFixed(2)} m (${Math.round(m * 100)} cm)`;
}

/**
 * Measure tool. Active only while `measureMode` is on. Click the scene to drop
 * point A, click again for point B — a line + distance label appears. Further
 * clicks start new measurements (oldest recycled past MAX_SEGMENTS). Orbit drags
 * are ignored via a <6px travel threshold. Esc exits. Works in 2D and 3D since
 * it raycasts the live scene with the active (persp or ortho) camera.
 */
export function MeasureLayer() {
  const measureMode = useConfigurator((s) => s.measureMode);
  const setMeasureMode = useConfigurator((s) => s.setMeasureMode);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [pending, setPending] = useState<THREE.Vector3 | null>(null);
  const nextId = useRef(1);

  // Clear everything when the tool is switched off.
  useEffect(() => {
    if (!measureMode) {
      setSegments([]);
      setPending(null);
    }
  }, [measureMode]);

  // Crosshair cursor while measuring.
  useEffect(() => {
    if (!measureMode) return;
    const el = gl.domElement;
    const prev = el.style.cursor;
    el.style.cursor = "crosshair";
    return () => {
      el.style.cursor = prev;
    };
  }, [measureMode, gl]);

  // Esc exits + clears.
  useEffect(() => {
    if (!measureMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMeasureMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [measureMode, setMeasureMode]);

  // Pointer handling + raycasting against the real scene meshes.
  useEffect(() => {
    if (!measureMode) return;
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved >= DRAG_PX) return; // this was an orbit/pan drag, not a click

      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      // Prefer the real kitchen model; fall back to the whole scene (placeholder).
      const root = scene.getObjectByName("ROOM_root") ?? scene;
      const hits = raycaster.intersectObject(root, true);
      const hit = hits.find((h) => {
        // Ignore our own markers/labels.
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.name === MARKERS_GROUP || o.name === "WINDOW_backdrop") return false;
          o = o.parent;
        }
        return true;
      });
      if (!hit) return;
      const point = hit.point.clone();

      setPending((prevPending) => {
        if (!prevPending) return point; // start a measurement
        // Complete a measurement.
        setSegments((prev) => {
          const seg: Segment = { id: nextId.current++, a: prevPending, b: point };
          const next = [...prev, seg];
          return next.length > MAX_SEGMENTS ? next.slice(next.length - MAX_SEGMENTS) : next;
        });
        return null;
      });
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [measureMode, gl, camera, scene]);

  if (!measureMode) return null;

  return (
    <group name={MARKERS_GROUP}>
      {pending && <PointMarker position={pending} />}
      {segments.map((seg) => {
        const mid = seg.a.clone().add(seg.b).multiplyScalar(0.5);
        return (
          <group key={seg.id}>
            <PointMarker position={seg.a} />
            <PointMarker position={seg.b} />
            <Line points={[seg.a, seg.b]} color="#f0b64a" lineWidth={2} depthTest={false} />
            <Html position={mid} center distanceFactor={8} zIndexRange={[100, 0]} occlude={false}>
              <div className="measure-label">{formatDist(seg.a, seg.b)}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function PointMarker({ position }: { position: THREE.Vector3 }) {
  return (
    <mesh position={position} renderOrder={999}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshBasicMaterial color="#f0b64a" depthTest={false} toneMapped={false} />
    </mesh>
  );
}
