import * as THREE from "three";
import { FINISH_SLOTS, type FinishOption, type FinishSlot } from "../config/finishes";
import type { Selections } from "../store/useConfigurator";

/**
 * Caches the original material found on each mesh (keyed by mesh uuid) so
 * keepOriginal options and hardware swaps can be rebuilt from the baked look.
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

// ---- texture loading (async, cached, graceful 404 fallback) -----------------

const loader = new THREE.TextureLoader();
const baseTexturePromises = new Map<string, Promise<THREE.Texture>>();

function getBaseTexture(url: string): Promise<THREE.Texture> {
  let p = baseTexturePromises.get(url);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(url, resolve, undefined, () => reject(new Error(`404 ${url}`)));
    });
    baseTexturePromises.set(url, p);
  }
  return p;
}

/**
 * Kick off async texture load and, on success, patch the material's map. On
 * failure (texture not generated yet / 404) the material keeps its flat swatch
 * colour, so the app degrades gracefully. Each material gets its own clone of
 * the base image so per-slot repeat values don't collide.
 */
function applyTextureTo(
  mat: THREE.MeshStandardMaterial,
  url: string,
  repeat: [number, number],
): void {
  getBaseTexture(url)
    .then((base) => {
      const tex = base.clone();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
      tex.needsUpdate = true;
      mat.map = tex;
      // With a real albedo map, neutralise the flat tint so the texture reads true.
      mat.color.set("#ffffff");
      mat.needsUpdate = true;
    })
    .catch(() => {
      /* keep the flat fallback colour already set on the material */
    });
}

// ---- material construction --------------------------------------------------

/** Build a fresh finish material from an option, starting from the base look. */
function makeFinishMaterial(base: THREE.Material, option: FinishOption): THREE.Material {
  const wantsPhysical = option.clearcoat !== undefined;

  let next: THREE.MeshStandardMaterial;
  if (wantsPhysical) {
    next = new THREE.MeshPhysicalMaterial({ name: base.name });
    const phys = next as THREE.MeshPhysicalMaterial;
    phys.clearcoat = option.clearcoat ?? 0;
    phys.clearcoatRoughness = option.clearcoatRoughness ?? 0.06;
  } else if (base instanceof THREE.MeshStandardMaterial) {
    next = base.clone() as THREE.MeshStandardMaterial;
  } else {
    next = new THREE.MeshStandardMaterial({ name: base.name });
  }

  next.name = base.name;
  next.map = null;
  if (option.color) next.color = new THREE.Color(option.color);
  if (option.roughness !== undefined) next.roughness = option.roughness;
  if (option.metalness !== undefined) next.metalness = option.metalness;

  if (option.texture && option.repeat) {
    applyTextureTo(next, option.texture, option.repeat);
  }

  next.needsUpdate = true;
  return next;
}

// ---- slot lookup ------------------------------------------------------------

const MATERIAL_SLOTS = FINISH_SLOTS.filter((s) => !s.objectSuffix);
const OBJECT_SLOTS = FINISH_SLOTS.filter((s) => !!s.objectSuffix);

function findSlotForMaterial(
  currentName: string,
  originalName: string | undefined,
): FinishSlot | undefined {
  return MATERIAL_SLOTS.find(
    (slot) =>
      currentName === slot.targetMaterial || originalName === slot.targetMaterial,
  );
}

function optionFor(slot: FinishSlot, selections: Selections): FinishOption {
  const id = selections[slot.id];
  return slot.options.find((o) => o.id === id) ?? slot.options[0];
}

// ---- main entry -------------------------------------------------------------

/**
 * Apply the currently-selected finishes across the whole scene. Two mechanisms:
 *   1. material-name swap (cabinet/countertop/island/floor/backsplash)
 *   2. object-name swap for hardware (every mesh whose name ends `_handle`)
 * `originals` provides the cached baked look for keepOriginal + hardware bases.
 * Missing materials/objects are simply skipped (graceful when the glb lacks them).
 */
export function applyFinishes(
  root: THREE.Object3D,
  selections: Selections,
  originals: OriginalCache,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const original = originals.get(mesh.uuid);

    // --- object-name (hardware) swap takes priority for matching meshes ---
    const objectSlot = OBJECT_SLOTS.find((s) => mesh.name.endsWith(s.objectSuffix!));
    if (objectSlot) {
      const option = optionFor(objectSlot, selections);
      const base = Array.isArray(original) ? original[0] : original;
      const single = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      mesh.material = makeFinishMaterial(base ?? single, option);
      return;
    }

    // --- material-name swap ---
    const resolveOne = (
      current: THREE.Material,
      originalMat: THREE.Material | undefined,
    ): THREE.Material => {
      const slot = findSlotForMaterial(current.name, originalMat?.name);
      if (!slot) return current;

      const option = optionFor(slot, selections);
      if (option.keepOriginal) {
        return originalMat ?? current;
      }
      return makeFinishMaterial(originalMat ?? current, option);
    };

    if (Array.isArray(mesh.material)) {
      const origArr = Array.isArray(original) ? original : undefined;
      mesh.material = mesh.material.map((m, i) => resolveOne(m, origArr?.[i]));
    } else {
      const origSingle = Array.isArray(original) ? undefined : original;
      mesh.material = resolveOne(mesh.material, origSingle);
    }
  });
}
