/**
 * Finish definitions for the swappable slots.
 *
 * Material names are FIXED by the Blender export contract:
 *   MAT_cabinet, MAT_counter_granite, MAT_butcher_block, MAT_floor_tile,
 *   MAT_backsplash, ...
 *
 * Each option is one of three shapes (all fields optional so the type stays
 * flat and JSON-serialisable):
 *   - flat colour:  { color, roughness?, metalness?, clearcoat?, clearcoatRoughness? }
 *   - textured:     { texture, repeat, roughness?, metalness?, ... } (+ swatch used as fallback tint)
 *   - keepOriginal: { keepOriginal: true }  -> restores the baked material
 *
 * The Hardware slot is special: it swaps by OBJECT name (every mesh whose name
 * ends in `_handle`) rather than by material name. It carries `objectSuffix`
 * and its options describe a metal look applied to a cloned per-handle material.
 */

export type FinishOption = {
  id: string;
  label: string;
  /** swatch colour shown in the UI panel (also the flat fallback when a texture 404s) */
  swatch: string;
  /** restore the cached original baked material instead of tinting */
  keepOriginal?: boolean;
  /** flat base colour (ignored when `texture` loads successfully) */
  color?: string;
  /** tileable texture URL under /textures (may 404 until generated) */
  texture?: string;
  /** UV repeat for the texture */
  repeat?: [number, number];
  roughness?: number;
  metalness?: number;
  /** presence of clearcoat promotes the material to MeshPhysicalMaterial */
  clearcoat?: number;
  clearcoatRoughness?: number;
};

export type FinishSlot = {
  id: "cabinet" | "countertop" | "island" | "floor" | "backsplash" | "hardware";
  label: string;
  /** material name in the glb this slot targets (unused for object-name slots) */
  targetMaterial: string;
  /**
   * When set, this slot swaps materials on OBJECTS whose name ends with this
   * suffix (e.g. "_handle") instead of by material name.
   */
  objectSuffix?: string;
  options: FinishOption[];
};

export const FINISH_SLOTS: FinishSlot[] = [
  {
    id: "cabinet",
    label: "Cabinet Finish",
    targetMaterial: "MAT_cabinet",
    options: [
      { id: "white_matte", label: "White Matte", swatch: "#f4f4f0", color: "#f4f4f0", roughness: 0.55, metalness: 0 },
      { id: "gloss_white", label: "Glossy White", swatch: "#f7f7f4", color: "#f7f7f4", roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.06 },
      { id: "gloss_red", label: "Glossy Red", swatch: "#b3202c", color: "#b3202c", roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.06 },
      { id: "sage", label: "Sage Green", swatch: "#9caf88", color: "#9caf88", roughness: 0.5, metalness: 0 },
      { id: "navy", label: "Navy", swatch: "#2c3a4f", color: "#2c3a4f", roughness: 0.5, metalness: 0 },
      { id: "charcoal", label: "Charcoal Matte", swatch: "#3a3d42", color: "#3a3d42", roughness: 0.6, metalness: 0 },
      { id: "oak", label: "Natural Oak", swatch: "#c8a06a", color: "#c8a06a", texture: "/textures/oak_natural.png", repeat: [2, 2], roughness: 0.5, metalness: 0 },
      { id: "walnut", label: "Walnut", swatch: "#5b4230", color: "#5b4230", texture: "/textures/walnut.png", repeat: [2, 2], roughness: 0.5, metalness: 0 },
    ],
  },
  {
    id: "countertop",
    label: "Countertop",
    targetMaterial: "MAT_counter_granite",
    options: [
      { id: "granite", label: "Granite", swatch: "#4a4a4d", keepOriginal: true },
      { id: "quartz", label: "White Quartz", swatch: "#e8e6e1", color: "#e8e6e1", roughness: 0.15, metalness: 0 },
      { id: "marble", label: "White Marble", swatch: "#eceae5", color: "#eceae5", texture: "/textures/marble_white.png", repeat: [2, 1], roughness: 0.12, metalness: 0 },
      { id: "dark_granite", label: "Dark Granite", swatch: "#33353a", color: "#33353a", texture: "/textures/granite_dark.png", repeat: [2, 2], roughness: 0.2, metalness: 0.05 },
    ],
  },
  {
    id: "island",
    label: "Island Top",
    targetMaterial: "MAT_butcher_block",
    options: [
      { id: "butcher", label: "Butcher Block", swatch: "#a5723c", keepOriginal: true },
      { id: "granite", label: "Granite", swatch: "#33353a", color: "#33353a", texture: "/textures/granite_dark.png", repeat: [1.5, 1.5], roughness: 0.2, metalness: 0.05 },
      { id: "marble", label: "White Marble", swatch: "#eceae5", color: "#eceae5", texture: "/textures/marble_white.png", repeat: [1.5, 1.5], roughness: 0.12, metalness: 0 },
      { id: "dark_stone", label: "Dark Stone", swatch: "#2f3134", color: "#2f3134", roughness: 0.25, metalness: 0.05 },
    ],
  },
  {
    id: "floor",
    label: "Floor",
    targetMaterial: "MAT_floor_tile",
    options: [
      { id: "gloss_tile", label: "Gloss Tile", swatch: "#eceae4", keepOriginal: true },
      { id: "marble_tile", label: "Marble Tile", swatch: "#eceae5", color: "#eceae5", texture: "/textures/marble_white.png", repeat: [4, 4], roughness: 0.15, metalness: 0 },
      { id: "light_laminate", label: "Light Oak Laminate", swatch: "#c9a978", color: "#c9a978", texture: "/textures/laminate_light.png", repeat: [6, 6], roughness: 0.5, metalness: 0 },
      { id: "dark_laminate", label: "Dark Laminate", swatch: "#4a3527", color: "#4a3527", texture: "/textures/laminate_dark.png", repeat: [6, 6], roughness: 0.5, metalness: 0 },
    ],
  },
  {
    id: "backsplash",
    label: "Backsplash",
    targetMaterial: "MAT_backsplash",
    options: [
      { id: "polished_stone", label: "Polished Stone", swatch: "#d9d6cf", keepOriginal: true },
      { id: "marble", label: "White Marble", swatch: "#eceae5", color: "#eceae5", texture: "/textures/marble_white.png", repeat: [3, 1], roughness: 0.12, metalness: 0 },
      { id: "gloss_glass", label: "Glossy Glass White", swatch: "#eef0ee", color: "#eef0ee", roughness: 0.05, metalness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.06 },
      { id: "smoked_glass", label: "Smoked Glass", swatch: "#3c4045", color: "#3c4045", roughness: 0.05, metalness: 0.05, clearcoat: 1.0, clearcoatRoughness: 0.06 },
    ],
  },
  {
    id: "hardware",
    label: "Hardware",
    targetMaterial: "",
    objectSuffix: "_handle",
    options: [
      { id: "chrome", label: "Chrome", swatch: "#d5d8dc", color: "#e8ebee", roughness: 0.15, metalness: 1 },
      { id: "matte_black", label: "Matte Black", swatch: "#1a1a1a", color: "#1a1a1a", roughness: 0.5, metalness: 0.6 },
      { id: "brass", label: "Brass", swatch: "#b08d57", color: "#b08d57", roughness: 0.25, metalness: 1 },
    ],
  },
];
