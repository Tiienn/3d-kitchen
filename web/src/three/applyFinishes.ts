import * as THREE from "three";
import { FINISH_SLOTS, type FinishSlot } from "../config/finishes";
import type { SlotId } from "../store/useConfigurator";

/**
 * Caches the original material found on each mesh (keyed by mesh uuid) so the
 * "default" / keepOriginal options can be restored after a swap.
 */
export type OriginalCache = Map<string, THREE.Material | THREE.Material[]>;

/** Build a cache of original materials for the whole scene. Call once on load. */
export function cacheOriginals(root: THREE.Object3D): OriginalCache {
  const cache: OriginalCache = new Map();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      cache.set(mesh.uuid, cloneMaterial(mesh.material));
    }
  });
  return cache;
}

function cloneMaterial(
  mat: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  return Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone();
}

function makeFinishMaterial(
  base: THREE.Material,
  color: string,
  roughness: number | undefined,
  metalness: number | undefined,
): THREE.MeshStandardMaterial {
  // Start from the base so we keep name + sensible defaults, then override.
  const next =
    base instanceof THREE.MeshStandardMaterial
      ? (base.clone() as THREE.MeshStandardMaterial)
      : new THREE.MeshStandardMaterial({ name: base.name });
  next.name = base.name;
  next.color = new THREE.Color(color);
  // Drop any baked map so the flat swap color reads cleanly.
  next.map = null;
  if (roughness !== undefined) next.roughness = roughness;
  if (metalness !== undefined) next.metalness = metalness;
  next.needsUpdate = true;
  return next;
}

/**
 * Apply the currently-selected finishes across the whole scene, by material
 * name. `originals` provides the cached default look for keepOriginal options.
 */
export function applyFinishes(
  root: THREE.Object3D,
  selections: Record<SlotId, string>,
  originals: OriginalCache,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const original = originals.get(mesh.uuid);

    const resolveOne = (
      current: THREE.Material,
      originalMat: THREE.Material | undefined,
    ): THREE.Material => {
      const slot = findSlotForMaterial(current.name, originalMat?.name);
      if (!slot) return current;

      const selectedId = selections[slot.id];
      const option =
        slot.options.find((o) => o.id === selectedId) ?? slot.options[0];

      // keepOriginal => restore the cached original material (preserving any
      // baked base-color texture). The option's `color` is only a UI swatch /
      // flat-color fallback, so we ignore it here when an original exists.
      if (option.keepOriginal && originalMat) {
        return originalMat;
      }
      if (option.color === null) {
        return originalMat ?? current;
      }
      return makeFinishMaterial(
        originalMat ?? current,
        option.color,
        option.roughness,
        option.metalness,
      );
    };

    if (Array.isArray(mesh.material)) {
      const origArr = Array.isArray(original) ? original : undefined;
      mesh.material = mesh.material.map((m, i) =>
        resolveOne(m, origArr?.[i]),
      );
    } else {
      const origSingle = Array.isArray(original) ? undefined : original;
      mesh.material = resolveOne(mesh.material, origSingle);
    }
  });
}

/**
 * Find the finish slot targeting a given material name. We check both the
 * current material name and the cached original name, because after a swap the
 * live material is a clone that still carries the same name.
 */
function findSlotForMaterial(
  currentName: string,
  originalName: string | undefined,
): FinishSlot | undefined {
  return FINISH_SLOTS.find(
    (slot) =>
      currentName === slot.targetMaterial ||
      originalName === slot.targetMaterial,
  );
}
