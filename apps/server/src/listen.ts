import type { FastifyInstance } from "fastify";

export interface ListenOptions {
  log?: (message: string) => void;
  exit?: (code: number) => never;
}

/**
 * Reports an EADDRINUSE listen failure with a single actionable line naming the
 * port and the remedy, then exits non-zero, instead of surfacing a raw stack
 * trace. Any other listen error is rethrown unchanged.
 */
export async function listen(app: FastifyInstance, host: string, port: number, options: ListenOptions = {}): Promise<void> {
  const log = options.log ?? ((message: string) => console.error(message));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  try {
    await app.listen({ port, host });
  } catch (error) {
    if (isBusyPortError(error)) {
      log(busyPortMessage(port));
      exit(1);
    }
    throw error;
  }
}

export function busyPortMessage(port: number): string {
  return `ainide: port ${port} is already in use. Stop the other instance or set PORT to a different value.`;
}

export function isBusyPortError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EADDRINUSE" || (typeof code === "string" && code.includes("EADDRINUSE"));
}
