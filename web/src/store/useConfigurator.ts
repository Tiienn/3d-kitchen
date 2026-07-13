import { create } from "zustand";
import { FINISH_SLOTS, type FinishSlot } from "../config/finishes";
import {
  decodeShareHash,
  loadProjects,
  makeId,
  saveProjects,
  type Project,
} from "../lib/share";

export type SlotId = FinishSlot["id"];
export type Selections = Record<SlotId, string>;
export type LightMode = "day" | "evening";
export type CameraPresetId = "overview" | "sink" | "island" | "range";

export const defaultSelections: Selections = FINISH_SLOTS.reduce((acc, slot) => {
  acc[slot.id] = slot.options[0].id;
  return acc;
}, {} as Selections);

/** Merge stored/shared selections onto defaults so missing/unknown slots are safe. */
function normalizeSelections(input: Partial<Selections> | undefined): Selections {
  const out: Selections = { ...defaultSelections };
  if (!input) return out;
  for (const slot of FINISH_SLOTS) {
    const v = input[slot.id];
    if (typeof v === "string" && slot.options.some((o) => o.id === v)) {
      out[slot.id] = v;
    }
  }
  return out;
}

type ConfiguratorState = {
  selections: Selections;
  lightMode: LightMode;
  cameraPreset: CameraPresetId;
  placeholderMode: boolean;

  /** world-space positions of island pendant shades (empty -> fallback used) */
  pendantPositions: [number, number, number][];

  // ---- projects / sharing ----
  projects: Project[];
  activeProjectId: string | null;
  /** true when viewing a design decoded from a #d= share hash (read-only banner) */
  sharedMode: boolean;
  sharedName: string | null;
  toast: string | null;

  // ---- actions ----
  setSelection: (slot: SlotId, optionId: string) => void;
  setLightMode: (mode: LightMode) => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setPlaceholderMode: (on: boolean) => void;
  setPendantPositions: (positions: [number, number, number][]) => void;

  createProject: (name?: string) => void;
  loadProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  saveSharedAsProject: () => void;

  showToast: (msg: string) => void;
  clearToast: () => void;
};

/** Update the active project (if any) from the live selections/lightMode + persist. */
function persistActive(state: ConfiguratorState): Pick<ConfiguratorState, "projects"> {
  if (state.sharedMode || !state.activeProjectId) return { projects: state.projects };
  const projects = state.projects.map((p) =>
    p.id === state.activeProjectId
      ? { ...p, selections: state.selections, lightMode: state.lightMode, updatedAt: Date.now() }
      : p,
  );
  saveProjects(projects);
  return { projects };
}

/** Compute the initial store slice: shared hash wins, else stored projects, else a seed. */
function initialState(): {
  selections: Selections;
  lightMode: LightMode;
  projects: Project[];
  activeProjectId: string | null;
  sharedMode: boolean;
  sharedName: string | null;
} {
  const shared =
    typeof window !== "undefined" ? decodeShareHash(window.location.hash) : null;
  const projects = loadProjects();

  if (shared) {
    return {
      selections: normalizeSelections(shared.selections),
      lightMode: shared.lightMode,
      projects,
      activeProjectId: null,
      sharedMode: true,
      sharedName: shared.name,
    };
  }

  if (projects.length > 0) {
    const first = projects[0];
    return {
      selections: normalizeSelections(first.selections),
      lightMode: first.lightMode === "evening" ? "evening" : "day",
      projects,
      activeProjectId: first.id,
      sharedMode: false,
      sharedName: null,
    };
  }

  // First run: seed a starter project.
  const seed: Project = {
    id: makeId(),
    name: "My first kitchen",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    selections: { ...defaultSelections },
    lightMode: "day",
  };
  saveProjects([seed]);
  return {
    selections: { ...defaultSelections },
    lightMode: "day",
    projects: [seed],
    activeProjectId: seed.id,
    sharedMode: false,
    sharedName: null,
  };
}

const init = initialState();

export const useConfigurator = create<ConfiguratorState>((set) => ({
  selections: init.selections,
  lightMode: init.lightMode,
  cameraPreset: "overview",
  placeholderMode: false,
  pendantPositions: [],

  projects: init.projects,
  activeProjectId: init.activeProjectId,
  sharedMode: init.sharedMode,
  sharedName: init.sharedName,
  toast: null,

  setSelection: (slot, optionId) =>
    set((state) => {
      const selections = { ...state.selections, [slot]: optionId };
      return { selections, ...persistActive({ ...state, selections }) };
    }),

  setLightMode: (mode) =>
    set((state) => ({ lightMode: mode, ...persistActive({ ...state, lightMode: mode }) })),

  setCameraPreset: (preset) => set({ cameraPreset: preset }),
  setPlaceholderMode: (on) => set({ placeholderMode: on }),
  setPendantPositions: (positions) => set({ pendantPositions: positions }),

  createProject: (name) =>
    set((state) => {
      const project: Project = {
        id: makeId(),
        name: (name && name.trim()) || `Kitchen ${state.projects.length + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        selections: { ...defaultSelections },
        lightMode: "day",
      };
      const projects = [...state.projects, project];
      saveProjects(projects);
      return {
        projects,
        activeProjectId: project.id,
        selections: { ...defaultSelections },
        lightMode: "day",
        sharedMode: false,
        sharedName: null,
      };
    }),

  loadProject: (id) =>
    set((state) => {
      const project = state.projects.find((p) => p.id === id);
      if (!project) return {};
      return {
        activeProjectId: id,
        selections: normalizeSelections(project.selections),
        lightMode: project.lightMode === "evening" ? "evening" : "day",
        sharedMode: false,
        sharedName: null,
      };
    }),

  renameProject: (id, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return {};
      const projects = state.projects.map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
      );
      saveProjects(projects);
      return { projects };
    }),

  deleteProject: (id) =>
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      saveProjects(projects);
      // If the active project was removed, load another or seed one.
      if (state.activeProjectId !== id) return { projects };
      if (projects.length > 0) {
        const next = projects[0];
        return {
          projects,
          activeProjectId: next.id,
          selections: normalizeSelections(next.selections),
          lightMode: next.lightMode === "evening" ? "evening" : "day",
        };
      }
      const seed: Project = {
        id: makeId(),
        name: "My first kitchen",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        selections: { ...defaultSelections },
        lightMode: "day",
      };
      const seeded = [seed];
      saveProjects(seeded);
      return {
        projects: seeded,
        activeProjectId: seed.id,
        selections: { ...defaultSelections },
        lightMode: "day",
      };
    }),

  saveSharedAsProject: () =>
    set((state) => {
      const project: Project = {
        id: makeId(),
        name: state.sharedName || "Shared kitchen",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        selections: { ...state.selections },
        lightMode: state.lightMode,
      };
      const projects = [...state.projects, project];
      saveProjects(projects);
      // Clear the share hash so a reload doesn't re-enter shared mode.
      if (typeof window !== "undefined" && window.location.hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return {
        projects,
        activeProjectId: project.id,
        sharedMode: false,
        sharedName: null,
        toast: "Saved as project",
      };
    }),

  showToast: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),
}));
