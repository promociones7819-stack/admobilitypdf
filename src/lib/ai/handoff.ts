// Puente entre el cuaderno de IA y el editor PDF: al pulsar una cita se
// registra qué fuente y página abrir; el editor lo consume al montarse.
export interface PendingOpen {
  sourceId: string;
  name: string;
  pageNumber: number;
  snippet?: string;
}

let pending: PendingOpen | null = null;
const listeners = new Set<(value: PendingOpen) => void>();

export function requestOpen(value: PendingOpen) {
  pending = value;
  listeners.forEach((listener) => listener(value));
}

export function takePendingOpen(): PendingOpen | null {
  const value = pending;
  pending = null;
  return value;
}

export function onOpenRequest(listener: (value: PendingOpen) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
