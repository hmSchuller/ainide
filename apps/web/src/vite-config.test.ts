import { describe, expect, it } from "vitest";
import { createViteConfig } from "../vite.config";

function proxyFor(portValue?: string): Record<string, string> {
  const proxy = createViteConfig(portValue).server.proxy;
  return proxy as Record<string, string>;
}

describe("Vite backend proxy", () => {
  it("uses the uncommon backend default without setting Vite's own port", () => {
    const config = createViteConfig();
    expect(proxyFor()["/api"]).toBe("http://127.0.0.1:43127");
    expect(proxyFor()["/events"]).toBe("ws://127.0.0.1:43127");
    expect(proxyFor()["/acp-events"]).toBe("ws://127.0.0.1:43127");
    expect(proxyFor()["/terminal"]).toBe("ws://127.0.0.1:43127");
    expect("port" in config.server).toBe(false);
  });

  it("follows a valid backend port override for HTTP and WebSocket paths", () => {
    const proxy = proxyFor("45678");
    expect(proxy["/api"]).toBe("http://127.0.0.1:45678");
    expect(proxy["/events"]).toBe("ws://127.0.0.1:45678");
    expect(proxy["/acp-events"]).toBe("ws://127.0.0.1:45678");
    expect(proxy["/terminal"]).toBe("ws://127.0.0.1:45678");
  });
});
