/**
 * Share-link + localStorage helpers for the projects workflow.
 *
 * Share format: the design payload {v:1, name, selections, lightMode} is
 * JSON-stringified, UTF-8 encoded, base64url-encoded, and placed in the URL
 * hash as `#d=<payload>`. Loading the app with that hash shows the design in a
 * read-only "shared" banner state until the viewer saves it as a project.
 */

import type { LightMode, Selections } from "../store/useConfigurator";

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  selections: Selections;
  lightMode: LightMode;
};

export type SharePayload = {
  v: 1;
  name: string;
  selections: Selections;
  lightMode: LightMode;
};

export const PROJECTS_KEY = "kitchen-projects-v1";

// ---- base64url <-> string ----------------------------------------------------

function toBase64Url(input: string): string {
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

// ---- share payload ----------------------------------------------------------

export function encodeShare(payload: SharePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Decode a `#d=...` hash. Returns null on anything malformed (ignored gracefully). */
export function decodeShareHash(hash: string): SharePayload | null {
  const m = /[#&]d=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(m[1])) as SharePayload;
    if (
      !parsed ||
      parsed.v !== 1 ||
      typeof parsed.name !== "string" ||
      typeof parsed.selections !== "object" ||
      parsed.selections === null
    ) {
      return null;
    }
    const lightMode: LightMode = parsed.lightMode === "evening" ? "evening" : "day";
    return { v: 1, name: parsed.name, selections: parsed.selections, lightMode };
  } catch {
    return null;
  }
}

export function buildShareUrl(payload: SharePayload): string {
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${base}#d=${encodeShare(payload)}`;
}

// ---- projects persistence ---------------------------------------------------

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Project =>
        p && typeof p.id === "string" && typeof p.name === "string" && !!p.selections,
    );
  } catch {
    return [];
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced write of the whole project list. */
export function saveProjects(projects: Project[]): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }, 250);
}

export function makeId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
