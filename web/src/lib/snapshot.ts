/**
 * Canvas snapshot helper. A small in-Canvas component registers the live
 * WebGLRenderer here; the toolbar button then grabs the drawing buffer and
 * triggers a PNG download. Requires the Canvas to be created with
 * `gl={{ preserveDrawingBuffer: true }}` so the buffer is readable after render.
 */
import type * as THREE from "three";

let renderer: THREE.WebGLRenderer | null = null;

export function registerRenderer(gl: THREE.WebGLRenderer | null): void {
  renderer = gl;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "kitchen";
}

/** Capture the current frame and download it as `<name>.png`. Returns success. */
export function capturePng(name: string): boolean {
  if (!renderer) return false;
  try {
    const url = renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    return false;
  }
}
