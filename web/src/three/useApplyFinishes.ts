import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useConfigurator } from "../store/useConfigurator";
import { applyFinishes, cacheOriginals, type OriginalCache } from "./applyFinishes";

/**
 * Given a ref to the loaded scene root (real glb or placeholder group), caches
 * the original materials once, then re-applies the selected finishes whenever a
 * selection changes. Works for both real and placeholder geometry because the
 * placeholder meshes carry the same MAT_* material names.
 */
export function useApplyFinishes(root: THREE.Object3D | null) {
  const selections = useConfigurator((s) => s.selections);
  const cacheRef = useRef<OriginalCache | null>(null);
  const cachedForRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!root) return;
    // Re-cache when the root object changes (e.g. placeholder -> real model).
    if (cachedForRef.current !== root) {
      cacheRef.current = cacheOriginals(root);
      cachedForRef.current = root;
    }
    if (cacheRef.current) {
      applyFinishes(root, selections, cacheRef.current);
    }
  }, [root, selections]);
}
