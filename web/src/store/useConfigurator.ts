import { create } from "zustand";
import { FINISH_SLOTS, type FinishSlot } from "../config/finishes";

export type SlotId = FinishSlot["id"];

export type CameraPresetId = "overview" | "sink" | "island" | "range";

type ConfiguratorState = {
  /** selected option id per slot */
  selections: Record<SlotId, string>;
  /** currently requested camera preset (consumed by the CameraRig) */
  cameraPreset: CameraPresetId;
  /** true when the real glb failed to load and placeholder geometry is shown */
  placeholderMode: boolean;

  setSelection: (slot: SlotId, optionId: string) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setPlaceholderMode: (on: boolean) => void;
};

const defaultSelections = FINISH_SLOTS.reduce(
  (acc, slot) => {
    acc[slot.id] = slot.options[0].id;
    return acc;
  },
  {} as Record<SlotId, string>,
);

export const useConfigurator = create<ConfiguratorState>((set) => ({
  selections: defaultSelections,
  cameraPreset: "overview",
  placeholderMode: false,

  setSelection: (slot, optionId) =>
    set((state) => ({
      selections: { ...state.selections, [slot]: optionId },
    })),
  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  setPlaceholderMode: (on) => set({ placeholderMode: on }),
}));
