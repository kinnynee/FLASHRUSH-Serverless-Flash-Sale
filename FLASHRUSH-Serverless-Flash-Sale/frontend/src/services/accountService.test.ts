import { afterEach, describe, expect, it, vi } from "vitest";
import { authHeaders, businessRequest, login } from "./accountService";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("account boundary", () => {
  it('explains an API route that is not deployed', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"Not Found"}', {status:404,headers:{'Content-Type':'application/json'}})));
    await expect(businessRequest('/admin/users')).rejects.toThrow('chưa được triển khai');
  });
  it('explains HTML returned in place of JSON', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', {status:200,headers:{'Content-Type':'text/html'}})));
    await expect(businessRequest('/admin/users')).rejects.toThrow('sai định dạng');
  });
  it("does not fabricate authentication without storage", () => {
    expect(authHeaders()).toEqual({});
  });
  it("forwards server denial", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://example.test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), {
            status: 403, headers: { "Content-Type": "application/json" },
          }),
        ),
    );
    await expect(businessRequest("/admin/users")).rejects.toThrow("FORBIDDEN");
  });
  it("retains only an access token after successful login", async () => {
    const store = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("sessionStorage", store);
    vi.stubEnv("VITE_API_BASE_URL", "https://example.test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ accessToken: "verified-access", expiresIn: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );
    await login("buyer@example.test", "test-password");
    expect(store.setItem).toHaveBeenCalledWith(
      expect.any(String),
      "verified-access",
    );
    expect(store.setItem).not.toHaveBeenCalledWith(
      expect.any(String),
      "test-password",
    );
  });
});
