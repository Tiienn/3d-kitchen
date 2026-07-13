import { Environment } from "@react-three/drei";
import { useConfigurator } from "../store/useConfigurator";

/**
 * Scene lighting for both Day and Evening moods.
 *
 * Day  = the original bright look (image-based Environment + ambient + hemi +
 *        warm shadow-casting key + cool window fill).
 * Evening = dimmed Environment/ambient/key, warm pendant point-lights hung at
 *        the island shade positions (from the store; fallback over island
 *        centre when the glb has no APP_pendant_* nodes), plus a subtle warm
 *        under-cabinet glow along the back run.
 *
 * Intensities are simply swapped on mode change — cheap and flicker-free.
 */

// Fallback pendant positions when the model exposes no APP_pendant_* nodes:
// three lights over island centre (0.55, ~1.95, 0.55), spread ±0.6 on x.
const FALLBACK_PENDANTS: [number, number, number][] = [
  [-0.05, 1.9, 0.55],
  [0.55, 1.9, 0.55],
  [1.15, 1.9, 0.55],
];

// Warm under-cabinet glow points along the back run (under the uppers).
const UNDER_CABINET: [number, number, number][] = [
  [-1.4, 1.5, -1.7],
  [-0.5, 1.5, -1.7],
  [0.4, 1.5, -1.7],
  [1.3, 1.5, -1.7],
];

export function Lighting() {
  const lightMode = useConfigurator((s) => s.lightMode);
  const pendants = useConfigurator((s) => s.pendantPositions);
  const evening = lightMode === "evening";

  const pendantPositions = pendants.length > 0 ? pendants : FALLBACK_PENDANTS;

  return (
    <>
      <Environment preset="apartment" environmentIntensity={evening ? 0.28 : 1.1} />
      <ambientLight intensity={evening ? 0.16 : 0.55} color={evening ? "#ffdcb0" : "#ffffff"} />
      <hemisphereLight args={[evening ? "#54463a" : "#ffffff", "#e7ded0", evening ? 0.12 : 0.55]} />

      {/* Key light: warm sun by day, dim warm by evening. */}
      <directionalLight
        position={[4.5, 7, 4]}
        intensity={evening ? 0.25 : 1.5}
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
      {/* Cool window-side fill (no shadows); nearly off in the evening. */}
      <directionalLight
        position={[-3, 4.5, -5]}
        intensity={evening ? 0.06 : 0.55}
        color="#dfe8ff"
      />

      {/* Warm pendant lamps over the island — bright in the evening. */}
      {pendantPositions.map((p, i) => (
        <pointLight
          key={`pendant-${i}`}
          position={p}
          intensity={evening ? 9 : 1.4}
          distance={evening ? 6 : 4}
          decay={2}
          color="#ffcf8f"
          castShadow={false}
        />
      ))}

      {/* Under-cabinet glow strip — evening only. */}
      {evening &&
        UNDER_CABINET.map((p, i) => (
          <pointLight
            key={`under-${i}`}
            position={p}
            intensity={2.2}
            distance={2.2}
            decay={2}
            color="#ffd9a3"
            castShadow={false}
          />
        ))}
    </>
  );
}
