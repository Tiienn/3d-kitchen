import { useEffect, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useConfigurator } from "../store/useConfigurator";
import { useApplyFinishes } from "../three/useApplyFinishes";

/** Path (relative to web/public) where the Blender export is expected. */
export const KITCHEN_GLB_URL = "/kitchen.glb";

/**
 * Loads web/public/kitchen.glb. If the file is missing/invalid, useGLTF throws
 * and the surrounding ErrorBoundary falls back to <PlaceholderKitchen />.
 */
export function KitchenModel() {
  const gltf = useGLTF(KITCHEN_GLB_URL);
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const setPlaceholderMode = useConfigurator((s) => s.setPlaceholderMode);

  useEffect(() => {
    setPlaceholderMode(false);
  }, [setPlaceholderMode]);

  // One-time prep of the imported scene:
  //  - shadows: everything receives; the room SHELL (walls/ceiling/floor) does
  //    NOT cast, so the exterior key light passes through the ceiling and lights
  //    the interior instead of leaving it in permanent shadow.
  //  - dollhouse occlusion: flip the wall + ceiling shells to THREE.BackSide so
  //    they vanish when viewed from outside (exterior orbit / overview) but still
  //    render as an interior backdrop from inside. Materials are cloned per-mesh
  //    so shared MAT_wall usage is never mutated globally.
  //  - glass: the exported MAT_glass is opaque; force real transparency.
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isShell = mesh.name.startsWith("ROOM_");
      mesh.castShadow = !isShell;
      mesh.receiveShadow = true;

      const isBackShell =
        mesh.name.startsWith("ROOM_wall") || mesh.name === "ROOM_ceiling";

      const applyToMat = (m: THREE.Material): THREE.Material => {
        let mat = m;
        if (isBackShell && mat.side !== THREE.BackSide) {
          mat = mat.clone();
          mat.side = THREE.BackSide;
          mat.needsUpdate = true;
        }
        if (mat.name === "MAT_glass" && !mat.transparent) {
          mat = mat === m ? mat.clone() : mat;
          mat.transparent = true;
          mat.opacity = 0.25;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
        return mat;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(applyToMat);
      } else if (mesh.material) {
        mesh.material = applyToMat(mesh.material);
      }
    });
  }, [gltf.scene]);

  useApplyFinishes(root);

  return (
    <group ref={setRoot} name="ROOM_root">
      <primitive object={gltf.scene} />
    </group>
  );
}

// Preload is intentionally NOT called at module scope: the file may not exist
// yet, and we want the ErrorBoundary to handle the failure at render time.
