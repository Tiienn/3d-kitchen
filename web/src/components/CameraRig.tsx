import { useEffect, useRef } from "react";
import { CameraControls, OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import CameraControlsImpl from "camera-controls";
import { useConfigurator, type CameraPresetId } from "../store/useConfigurator";
import { planCamera, registerCameraApi, ROOM } from "../lib/viewBridge";

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

const ACTION = CameraControlsImpl.ACTION;

// Top-down 2D plan camera: high above room centre, looking straight down.
const PLAN_EYE: [number, number, number] = [ROOM.centerX, 8, ROOM.centerZ];
const PLAN_TARGET: [number, number, number] = [ROOM.centerX, 0, ROOM.centerZ];
// -Z (back wall) maps to screen-up so the plan orientation is fixed.
const PLAN_UP = new THREE.Vector3(0, 0, -1);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);

const ROOM_W = ROOM.maxX - ROOM.minX; // 5.0
const ROOM_D = ROOM.maxZ - ROOM.minZ; // 4.2

/** Orthographic zoom (px per world-metre) that frames the whole room + margin. */
function fitPlanZoom(width: number, height: number): number {
  if (!width || !height) return 120;
  return Math.min(width / ROOM_W, height / ROOM_D) * 0.82;
}

/**
 * Camera rig with two modes sharing ONE CameraControls instance:
 *
 *  - 3D (default): the Canvas perspective camera; orbit / dolly / truck as before.
 *  - 2D: an <OrthographicCamera makeDefault> straight down over the room. Because
 *    CameraControls reads the R3F *default* camera (no explicit `camera` prop),
 *    flipping which camera is `makeDefault` transparently rebinds the controls to
 *    the ortho cam — drei recreates the impl on the new camera. We then lock polar
 *    + azimuth to 0 (pure top-down, no rotation) and remap the mouse/touch buttons
 *    to pan+zoom only. The last 3D pose is tracked every frame and restored on the
 *    way back, so toggling never loses the user's 3D framing.
 */
export function CameraRig() {
  const controlsRef = useRef<CameraControls>(null);
  const preset = useConfigurator((s) => s.cameraPreset);
  const viewMode = useConfigurator((s) => s.viewMode);

  // The current R3F default camera flips between perspective and ortho.
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  // Last known 3D pose (pos + target); refreshed continuously while in 3D.
  const lastPose = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 }>({
    pos: new THREE.Vector3(...PRESETS.overview.pos),
    target: new THREE.Vector3(...PRESETS.overview.target),
  });

  // Apply a camera preset (3D only). In 2D, presets are inert.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || viewMode !== "3d") return;
    const { pos, target } = PRESETS[preset];
    void controls.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], true);
  }, [preset, viewMode]);

  // Reconfigure controls whenever the active camera changes (i.e. on 2D<->3D
  // swap). Keyed on `camera` so it runs AFTER drei has rebound the controls to
  // the new default camera and controlsRef.current is the fresh instance.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (viewMode === "2d" && (camera as THREE.Camera).type === "OrthographicCamera") {
      // Pan + zoom only — no rotation.
      controls.mouseButtons.left = ACTION.TRUCK;
      controls.mouseButtons.right = ACTION.TRUCK;
      controls.mouseButtons.middle = ACTION.TRUCK;
      controls.mouseButtons.wheel = ACTION.ZOOM;
      controls.touches.one = ACTION.TOUCH_TRUCK;
      controls.touches.two = ACTION.TOUCH_ZOOM;
      controls.touches.three = ACTION.TOUCH_TRUCK;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = 0;
      controls.minAzimuthAngle = 0;
      controls.maxAzimuthAngle = 0;

      camera.up.copy(PLAN_UP);
      controls.updateCameraUp();
      void controls.setLookAt(
        PLAN_EYE[0], PLAN_EYE[1], PLAN_EYE[2],
        PLAN_TARGET[0], PLAN_TARGET[1], PLAN_TARGET[2],
        false,
      );
      void controls.zoomTo(fitPlanZoom(size.width, size.height), false);
    } else if (viewMode === "3d" && (camera as THREE.Camera).type === "PerspectiveCamera") {
      // Restore full 3D orbit behaviour.
      controls.mouseButtons.left = ACTION.ROTATE;
      controls.mouseButtons.right = ACTION.TRUCK;
      controls.mouseButtons.middle = ACTION.DOLLY;
      controls.mouseButtons.wheel = ACTION.DOLLY;
      controls.touches.one = ACTION.TOUCH_ROTATE;
      controls.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
      controls.touches.three = ACTION.TOUCH_TRUCK;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;

      camera.up.copy(DEFAULT_UP);
      controls.updateCameraUp();
      const { pos, target } = lastPose.current;
      void controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, viewMode]);

  // Register the imperative camera API for DOM overlays (minimap click, fit).
  useEffect(() => {
    registerCameraApi({
      moveTo: (x, z) => {
        const controls = controlsRef.current;
        if (!controls || useConfigurator.getState().viewMode !== "3d") return;
        void controls.setLookAt(x, 1.6, z, ROOM.centerX, 0.9, ROOM.centerZ, true);
      },
      fit: () => {
        const controls = controlsRef.current;
        if (!controls) return;
        if (useConfigurator.getState().viewMode === "2d") {
          void controls.setLookAt(
            PLAN_EYE[0], PLAN_EYE[1], PLAN_EYE[2],
            PLAN_TARGET[0], PLAN_TARGET[1], PLAN_TARGET[2],
            true,
          );
          void controls.zoomTo(fitPlanZoom(size.width, size.height), true);
        } else {
          const { pos, target } = PRESETS.overview;
          void controls.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], true);
        }
      },
    });
    return () => registerCameraApi(null);
  }, [size.width, size.height]);

  // Track the live camera footprint for the minimap indicator, and keep the
  // last 3D pose fresh (imperative — no React state, no re-render).
  const tmpPos = useRef(new THREE.Vector3());
  const tmpTarget = useRef(new THREE.Vector3());
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.getPosition(tmpPos.current);
    controls.getTarget(tmpTarget.current);
    planCamera.x = tmpPos.current.x;
    planCamera.z = tmpPos.current.z;
    const dx = tmpTarget.current.x - tmpPos.current.x;
    const dz = tmpTarget.current.z - tmpPos.current.z;
    // In 2D the eye is directly above the target (dx≈dz≈0): keep last heading.
    if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
      planCamera.angle = Math.atan2(dz, dx);
    }
    if (useConfigurator.getState().viewMode === "3d") {
      lastPose.current.pos.copy(tmpPos.current);
      lastPose.current.target.copy(tmpTarget.current);
    }
  });

  return (
    <>
      {/* Ortho plan camera: only the *default* camera when in 2D mode. */}
      <OrthographicCamera
        makeDefault={viewMode === "2d"}
        position={PLAN_EYE}
        near={0.1}
        far={100}
        zoom={fitPlanZoom(size.width, size.height)}
      />
      <CameraControls
        ref={controlsRef}
        makeDefault
        smoothTime={0.35}
        minDistance={1.2}
        maxDistance={12}
      />
    </>
  );
}
