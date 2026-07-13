import { useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import { useConfigurator, type CameraPresetId } from "../store/useConfigurator";

type Preset = {
  /** camera position */
  pos: [number, number, number];
  /** look-at target */
  target: [number, number, number];
};

// Presets retargeted to the real kitchen.glb geometry (glTF Y-up, meters).
// Each was verified to frame its subject's world bounding box within the 45°
// FOV (see report). Room: x∈[-2.5,2.5], z∈[-2.1,2.1], walls 2.7 high; the
// exterior overview/island cams rely on the dollhouse BackSide shell.
const PRESETS: Record<CameraPresetId, Preset> = {
  // whole kitchen, front-right elevated 3/4 view (exterior)
  overview: { pos: [5.0, 3.6, 5.3], target: [0.1, 0.85, -0.15] },
  // sink + faucet + window on the back wall (interior, looking -z)
  sink: { pos: [-0.3, 1.42, 0.5], target: [-0.3, 1.02, -1.85] },
  // island + butcher-block top + both stools (from the open front side)
  island: { pos: [0.6, 2.2, 4.15], target: [0.55, 0.7, 0.45] },
  // gas range + hood on the right of the back run (looking back-left)
  range: { pos: [1.5, 1.7, 1.05], target: [1.55, 1.0, -1.85] },
};

export function CameraRig() {
  const controlsRef = useRef<CameraControls>(null);
  const preset = useConfigurator((s) => s.cameraPreset);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const { pos, target } = PRESETS[preset];
    void controls.setLookAt(
      pos[0],
      pos[1],
      pos[2],
      target[0],
      target[1],
      target[2],
      true, // enableTransition -> smooth, damped move
    );
  }, [preset]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      smoothTime={0.5}
      minDistance={1.2}
      maxDistance={12}
    />
  );
}
