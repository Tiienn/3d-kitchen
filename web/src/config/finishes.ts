/**
 * Finish definitions for the three swappable slots.
 *
 * Material names are FIXED by the Blender export contract:
 *   MAT_cabinet, MAT_counter_granite, MAT_floor_tile, MAT_butcher_block, ...
 *
 * Each option carries the target PBR params applied to a fresh
 * MeshStandardMaterial. The `default` option keeps the model's baked
 * material (handled by the applier via cached originals).
 */

export type FinishColor = {
  /** hex color, or null to keep the cached original material */
  color: string | null;
  roughness?: number;
  metalness?: number;
};

export type FinishOption = {
  id: string;
  label: string;
  /** swatch color shown in the UI panel */
  swatch: string;
  /** if true, restore the cached original material instead of tinting */
  keepOriginal?: boolean;
} & FinishColor;

export type FinishSlot = {
  id: "cabinet" | "countertop" | "floor";
  label: string;
  /** material name in the glb this slot targets */
  targetMaterial: string;
  options: FinishOption[];
};

export const FINISH_SLOTS: FinishSlot[] = [
  {
    id: "cabinet",
    label: "Cabinet Finish",
    targetMaterial: "MAT_cabinet",
    options: [
      {
        id: "white",
        label: "White",
        swatch: "#f4f4f0",
        color: "#f4f4f0",
        roughness: 0.55,
        metalness: 0,
      },
      {
        id: "sage",
        label: "Sage Green",
        swatch: "#9caf88",
        color: "#9caf88",
        roughness: 0.55,
        metalness: 0,
      },
      {
        id: "navy",
        label: "Navy",
        swatch: "#2c3a4f",
        color: "#2c3a4f",
        roughness: 0.5,
        metalness: 0,
      },
      {
        id: "oak",
        label: "Natural Oak",
        swatch: "#c8a06a",
        color: "#c8a06a",
        roughness: 0.5,
        metalness: 0,
      },
    ],
  },
  {
    id: "countertop",
    label: "Countertop",
    targetMaterial: "MAT_counter_granite",
    options: [
      {
        id: "granite",
        label: "Granite",
        swatch: "#4a4a4d",
        // dark speckle approximation; keeps original if present
        color: "#4a4a4d",
        roughness: 0.3,
        metalness: 0.05,
        keepOriginal: true,
      },
      {
        id: "quartz",
        label: "White Quartz",
        swatch: "#e8e6e1",
        color: "#e8e6e1",
        roughness: 0.15,
        metalness: 0,
      },
      {
        id: "butcher",
        label: "Butcher Block",
        swatch: "#a5723c",
        // reuse MAT_butcher_block warm wood tone
        color: "#a5723c",
        roughness: 0.55,
        metalness: 0,
      },
    ],
  },
  {
    id: "floor",
    label: "Floor",
    targetMaterial: "MAT_floor_tile",
    options: [
      {
        id: "tile",
        label: "Tile",
        swatch: "#cfc9be",
        color: "#cfc9be",
        roughness: 0.4,
        metalness: 0,
        keepOriginal: true,
      },
      {
        id: "lightoak",
        label: "Light Oak",
        swatch: "#c9a978",
        color: "#c9a978",
        roughness: 0.55,
        metalness: 0,
      },
      {
        id: "slate",
        label: "Dark Slate",
        swatch: "#3a3d40",
        color: "#3a3d40",
        roughness: 0.6,
        metalness: 0,
      },
    ],
  },
];
