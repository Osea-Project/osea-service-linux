import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const validEnvironment = {
  PVE_HOST: "https://proxmox.example.org:8006",
  PVE_TOKEN_ID: "osea@pve!service",
  PVE_TOKEN_SECRET: "secret-value",
};

test("loads the required Proxmox settings and defaults the service listener", () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.equal(config.proxmoxHost.origin, "https://proxmox.example.org:8006");
});

test("rejects Proxmox hosts that do not use HTTPS", () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, PVE_HOST: "http://proxmox.example.org:8006" }),
    /PVE_HOST must use HTTPS/,
  );
});

test("rejects credentials and paths embedded in the Proxmox host URL", () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, PVE_HOST: "https://user:pass@proxmox.example.org/api" }),
    /without credentials or a path/,
  );
});

test("reports invalid environment keys without exposing their values", () => {
  assert.throws(
    () => loadConfig({ PVE_HOST: "not-a-url", PVE_TOKEN_ID: "id", PVE_TOKEN_SECRET: "secret-value" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /PVE_HOST/);
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    },
  );
});
