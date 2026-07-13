import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Html } from "@react-three/drei";
import { KitchenModel } from "./KitchenModel";
import { PlaceholderKitchen } from "./PlaceholderKitchen";
import { ErrorBoundary } from "./ErrorBoundary";
import { CameraRig } from "./CameraRig";

function Loader() {
  return (
    <Html center>
      <div className="scene-loader">Loading kitchen…</div>
    </Html>
  );
}

export function KitchenScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [5.0, 3.6, 5.3], fov: 45, near: 0.1, far: 100 }}
    >
      {/*
        Interior lighting. The glb ships with no lights and now has an enclosing
        ceiling, so the interior needs generous fill: image-based Environment +
        ambient + a hemisphere top light keep every corner readable, while a
        single shadow-casting key light gives the cabinets/island grounded
        shadows on the real floor. The room shell doesn't cast shadows (set in
        KitchenModel), so the key light reaches the floor through the ceiling.
        A cool, non-shadowing fill from the window side lifts the back wall.
        No ContactShadows: the real floor already receives the key-light shadow,
        and a 12 m blob would spill through the walls.
      */}
      <Environment preset="apartment" environmentIntensity={1.1} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#ffffff", "#e7ded0", 0.55]} />
      <directionalLight
        position={[4.5, 7, 4]}
        intensity={1.5}
        color="#fff4e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0002}
        shadow-camera-far={22}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      {/* cool fill from the window (back wall) side, no shadows */}
      <directionalLight position={[-3, 4.5, -5]} intensity={0.55} color="#dfe8ff" />

      <Suspense fallback={<Loader />}>
        {/* Try the real glb; fall back to placeholder geometry on failure. */}
        <ErrorBoundary fallback={<PlaceholderKitchen />}>
          <KitchenModel />
        </ErrorBoundary>
      </Suspense>

      <CameraRig />
    </Canvas>
  );
}
