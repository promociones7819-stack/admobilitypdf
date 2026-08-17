export type ZoomMode = number | "fit-page" | "fit-width";

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((s) => s > current + 0.001) ?? current;
}

export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? current;
}
