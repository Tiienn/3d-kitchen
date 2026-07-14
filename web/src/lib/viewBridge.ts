/**
 * Lightweight imperative bridge between the in-Canvas camera and the DOM
 * overlays (mini floor-plan, view toolbar). Kept out of React state so the
 * live camera indicator can update every frame with ZERO re-renders.
 *
 *  - `planCamera` is mutated each frame by <CameraTracker> (useFrame) and read
 *    by the MiniMap's own rAF loop to move the SVG camera indicator.
 *  - `cameraApi` is registered by <CameraRig> so DOM controls (minimap click,
 *    the "fit" button) can command the camera without prop-drilling through
 *    the Canvas boundary.
 */

/** Live camera footprint on the XZ plane, in world meters. */
export const planCamera = {
  /** camera X (world) */
  x: 0,
  /** camera Z (world) */
  z: 0,
  /** view-direction heading in radians: atan2(dirZ, dirX) */
  angle: 0,
};

export type CameraApi = {
  /** Move to a plan point (3D only): stand at (x,z), look at room centre. */
  moveTo: (x: number, z: number) => void;
  /** Re-centre / fit the current view (overview in 3D, whole-room in 2D). */
  fit: () => void;
};

let cameraApi: CameraApi | null = null;

export function registerCameraApi(api: CameraApi | null): void {
  cameraApi = api;
}

export function getCameraApi(): CameraApi | null {
  return cameraApi;
}

/** Room bounds (world meters) — matches the Blender export geometry. */
export const ROOM = {
  minX: -2.5,
  maxX: 2.5,
  minZ: -2.1,
  maxZ: 2.1,
  centerX: 0,
  centerZ: 0,
};
