import { Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { KitchenModel } from "./KitchenModel";
import { PlaceholderKitchen } from "./PlaceholderKitchen";
import { ErrorBoundary } from "./ErrorBoundary";
import { CameraRig } from "./CameraRig";
import { Lighting } from "./Lighting";
import { WindowBackdrop } from "./WindowBackdrop";
import { useEffect } from "react";
import { registerRenderer } from "../lib/snapshot";

function Loader() {
  return (
    <Html center>
      <div className="scene-loader">Loading kitchen…</div>
    </Html>
  );
}

/** Registers the live renderer so the toolbar can capture PNG snapshots. */
function CanvasCapture() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    registerRenderer(gl);
    return () => registerRenderer(null);
  }, [gl]);
  return null;
}

export function KitchenScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      // preserveDrawingBuffer keeps the frame readable for PNG snapshots.
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [5.0, 3.6, 5.3], fov: 45, near: 0.1, far: 100 }}
    >
      {/* Day / Evening lighting, incl. pendant + under-cabinet lights. */}
      <Lighting />

      {/* Bright daylight (or dusk) backdrop behind the window. */}
      <WindowBackdrop />

      <Suspense fallback={<Loader />}>
        {/* Try the real glb; fall back to placeholder geometry on failure. */}
        <ErrorBoundary fallback={<PlaceholderKitchen />}>
          <KitchenModel />
        </ErrorBoundary>
      </Suspense>

      <CameraRig />
      <CanvasCapture />
    </Canvas>
  );
}
