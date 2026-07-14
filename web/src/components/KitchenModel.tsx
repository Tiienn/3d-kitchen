import { useEffect, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useConfigurator, type PlanRect } from "../store/useConfigurator";
import { useApplyFinishes } from "../three/useApplyFinishes";

// Category matchers for the mini floor-plan: each maps a node-name prefix to
// the plan-rect kind. Boxes are taken from the highest matching ancestor so a
// group and its child meshes aren't double-counted.
const PLAN_CATS: { re: RegExp; kind: PlanRect["kind"] }[] = [
  { re: /^CAB_base/i, kind: "cabinet" },
  { re: /^ISL_/i, kind: "island" },
  { re: /^APP_fridge/i, kind: "fridge" },
  { re: /^APP_range/i, kind: "range" },
  { re: /^FIX_sink_basin/i, kind: "sink" },
];

/** Project the glb footprints onto XZ. Returns [] if nothing matched. */
function derivePlanShapes(scene: THREE.Object3D): PlanRect[] {
  scene.updateWorldMatrix(true, true);
  const rects: PlanRect[] = [];
  const box = new THREE.Box3();
  scene.traverse((obj) => {
    for (const cat of PLAN_CATS) {
      if (!cat.re.test(obj.name)) continue;
      // Skip if an ancestor of the same kind was already recorded.
      if (obj.parent && cat.re.test(obj.parent.name)) return;
      box.setFromObject(obj);
      if (box.isEmpty()) return;
      const w = box.max.x - box.min.x;
      const d = box.max.z - box.min.z;
      if (w < 0.05 || d < 0.05) return;
      rects.push({ x: box.min.x, z: box.min.z, w, d, kind: cat.kind });
      return;
    }
  });
  return rects;
}

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
  const setPendantPositions = useConfigurator((s) => s.setPendantPositions);
  const setPlanShapes = useConfigurator((s) => s.setPlanShapes);
  const lightMode = useConfigurator((s) => s.lightMode);
  const viewMode = useConfigurator((s) => s.viewMode);

  useEffect(() => {
    setPlaceholderMode(false);
  }, [setPlaceholderMode]);

  // Publish plan footprints for the mini floor-plan (empty -> DOM fallback).
  useEffect(() => {
    setPlanShapes(derivePlanShapes(gltf.scene));
  }, [gltf.scene, setPlanShapes]);

  // In 2D plan view, hide the ceiling and pendant shades so they don't occlude
  // the top-down plan. Restored on return to 3D.
  useEffect(() => {
    const plan = viewMode === "2d";
    gltf.scene.traverse((obj) => {
      if (obj.name === "ROOM_ceiling" || /^APP_pendant_/i.test(obj.name)) {
        obj.visible = !plan;
      }
    });
  }, [gltf.scene, viewMode]);

  // Locate island pendant shades so the evening lights can hang at them.
  // Prefer the *_bulb child meshes; fall back to the APP_pendant_N nodes.
  // If the model has no pendants yet, publish [] so Lighting uses its fallback.
  useEffect(() => {
    gltf.scene.updateWorldMatrix(true, true);
    const found: [number, number, number][] = [];
    const seen = new Set<string>();
    const collect = (test: (name: string) => boolean) => {
      gltf.scene.traverse((obj) => {
        if (!test(obj.name) || seen.has(obj.name)) return;
        seen.add(obj.name);
        const p = new THREE.Vector3();
        obj.getWorldPosition(p);
        found.push([p.x, p.y, p.z]);
      });
    };
    collect((n) => /^APP_pendant_\d+_bulb$/.test(n));
    if (found.length === 0) collect((n) => /^APP_pendant_\d+$/.test(n));
    setPendantPositions(found);
  }, [gltf.scene, setPendantPositions]);

  // MAT_bulb is emissive and never swapped — just make it glow harder at night.
  useEffect(() => {
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.name !== "MAT_bulb") continue;
        const em = m as THREE.MeshStandardMaterial;
        if ("emissiveIntensity" in em) {
          em.emissiveIntensity = lightMode === "evening" ? 3.0 : 1.0;
          em.needsUpdate = true;
        }
      }
    });
  }, [gltf.scene, lightMode]);

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
          // Backsplash panels and cabinet backs sit exactly on the wall planes;
          // nudge the shells back in depth so coplanar geometry can't z-fight.
          mat.polygonOffset = true;
          mat.polygonOffsetFactor = 2;
          mat.polygonOffsetUnits = 2;
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
