import { useMemo } from "react";
import * as THREE from "three";
import { useConfigurator } from "../store/useConfigurator";

/**
 * A bright, unlit backdrop plane placed just OUTSIDE the back wall behind the
 * window, so the window reads as daylight instead of a black void. It uses a
 * generated vertical gradient (sky -> pale horizon -> blurred garden green) on a
 * MeshBasicMaterial with toneMapped disabled so it stays bright regardless of
 * exposure. Evening swaps the gradient to a dusk palette. It neither casts nor
 * receives shadows and sits only behind the window region.
 */

// Back wall is at z ≈ -2.1; place the backdrop just beyond it.
const BACKDROP_Z = -2.3;
// Generously beyond the window opening (~x∈[-1.4,0.8], y∈[0.8,2.4]).
const CENTER_X = -0.3;
const CENTER_Y = 1.6;
const WIDTH = 3.0;
const HEIGHT = 2.4;

type Stops = { at: number; color: string }[];

function makeGradientTexture(stops: Stops): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  for (const s of stops) grad.addColorStop(s.at, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const DAY_STOPS: Stops = [
  { at: 0.0, color: "#8ec5ff" }, // sky blue
  { at: 0.45, color: "#cfe6f7" }, // pale horizon
  { at: 0.62, color: "#e8eede" }, // hazy band
  { at: 0.75, color: "#9cbf7a" }, // garden green
  { at: 1.0, color: "#6f9c58" }, // deeper foliage
];

const DUSK_STOPS: Stops = [
  { at: 0.0, color: "#2a2350" }, // deep blue-purple
  { at: 0.4, color: "#4b3a6b" },
  { at: 0.62, color: "#7d5a76" }, // muted dusk horizon
  { at: 0.78, color: "#3e4a3a" }, // shadowed garden
  { at: 1.0, color: "#232a25" },
];

export function WindowBackdrop() {
  const lightMode = useConfigurator((s) => s.lightMode);

  const texture = useMemo(
    () => makeGradientTexture(lightMode === "evening" ? DUSK_STOPS : DAY_STOPS),
    [lightMode],
  );

  return (
    <mesh
      name="WINDOW_backdrop"
      position={[CENTER_X, CENTER_Y, BACKDROP_Z]}
      renderOrder={-1}
    >
      <planeGeometry args={[WIDTH, HEIGHT]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        side={THREE.FrontSide}
        depthWrite={false}
      />
    </mesh>
  );
}
