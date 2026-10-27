import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { ProxmoxApiError, VirtualMachineNotFoundError } from "../src/errors.js";
import { ProxmoxClient } from "../src/proxmox-client.js";

const config = loadConfig({
  PVE_HOST: "https://proxmox.example.org:8006",
  PVE_TOKEN_ID: "osea@pve!service",
  PVE_TOKEN_SECRET: "secret-value",
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("lists Proxmox VMs using provider-neutral fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([
    { vmid: 100, name: "database-01", node: "pve-a", type: "qemu", status: "running" },
    { vmid: 101, name: null, node: "pve-b", type: "lxc", status: "paused" },
  ]);

  try {
    const virtualMachines = await new ProxmoxClient(config).listVirtualMachines();

    assert.deepEqual(virtualMachines, [
      { id: "100", name: "database-01", status: "running" },
      { id: "101", name: "101", status: "unknown" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("starts a VM through its current node and includes the scoped API token", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({
      url,
      method,
      authorization: new Headers(init?.headers).get("Authorization"),
    });

    if (method === "GET") {
      return jsonResponse([
        { vmid: 100, name: "database-01", node: "pve-a", type: "qemu", status: "stopped" },
      ]);
    }

    return jsonResponse("UPID:pve-a:00000001:00000001:00000001:qmstart:100:root@pam:");
  };

  try {
    const taskId = await new ProxmoxClient(config).startVirtualMachine("100");

    assert.match(taskId, /^UPID:/);
    assert.equal(requests[1]?.url, "https://proxmox.example.org:8006/api2/json/nodes/pve-a/qemu/100/status/start");
    assert.equal(requests[1]?.method, "POST");
    assert.equal(requests[1]?.authorization, "PVEAPIToken=osea@pve!service=secret-value");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports a VM missing from the visible Proxmox inventory", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([]);

  try {
    await assert.rejects(new ProxmoxClient(config).startVirtualMachine("100"), VirtualMachineNotFoundError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed Proxmox inventory responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([{ vmid: "not-a-number" }]);

  try {
    await assert.rejects(new ProxmoxClient(config).listVirtualMachines(), ProxmoxApiError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unsuccessful Proxmox API responses without returning provider details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("secret provider response", { status: 403 });

  try {
    await assert.rejects(
      new ProxmoxClient(config).listVirtualMachines(),
      (error: unknown) => {
        assert.ok(error instanceof ProxmoxApiError);
        assert.match(error.message, /HTTP 403/);
        assert.doesNotMatch(error.message, /secret provider response/);
        assert.doesNotMatch(error.message, /secret-value/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
