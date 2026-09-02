import { DEFAULT_BACKEND_PORT, resolveBackendPort } from "@ainide/shared";
import { describe, expect, it } from "vitest";

describe("backend port resolution", () => {
  it("uses the uncommon default when PORT is unset", () => {
    expect(resolveBackendPort(undefined)).toBe(DEFAULT_BACKEND_PORT);
    expect(DEFAULT_BACKEND_PORT).toBe(43127);
  });

  it("uses the default for malformed or out-of-range values", () => {
    for (const value of ["", "abc", "43127.5", "43127extra", "0", "65536"]) {
      expect(resolveBackendPort(value)).toBe(DEFAULT_BACKEND_PORT);
    }
  });

  it("accepts the TCP port boundaries and valid overrides", () => {
    expect(resolveBackendPort("1")).toBe(1);
    expect(resolveBackendPort("65535")).toBe(65535);
    expect(resolveBackendPort("45678")).toBe(45678);
  });
});
