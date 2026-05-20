import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("secret crypto", () => {
  it("encrypts and decrypts values without returning plaintext", async () => {
    const { decryptSecret, encryptSecret } = await import("@/lib/secret-crypto");
    const encrypted = encryptSecret("sk-test-123456");

    expect(encrypted).not.toContain("sk-test-123456");
    expect(decryptSecret(encrypted)).toBe("sk-test-123456");
  });

  it("masks secret previews", async () => {
    const { previewSecret } = await import("@/lib/secret-crypto");
    expect(previewSecret("sk-test-123456")).toBe("sk-t…3456");
  });
});
