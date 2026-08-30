export const DEFAULT_BACKEND_PORT = 43127;

const TCP_PORT_PATTERN = /^\d+$/;

export function resolveBackendPort(value: string | undefined): number {
  if (!value || !TCP_PORT_PATTERN.test(value)) return DEFAULT_BACKEND_PORT;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_BACKEND_PORT;
}
