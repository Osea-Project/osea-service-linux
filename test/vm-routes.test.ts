import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { createErrorHandler } from "../src/http-error-handler.js";
import { VirtualMachineNotFoundError } from "../src/errors.js";
import { HTTP_STATUS } from "../src/http-status.js";
import type { ProxmoxClient, VirtualMachine } from "../src/proxmox-client.js";
import { createVmRouter } from "../src/vm-routes.js";

interface TestResponse {
  statusCode: number;
  body: unknown;
  status(code: number): TestResponse;
  json(body: unknown): TestResponse;
}

function createTestResponse(): TestResponse {
  return {
    statusCode: HTTP_STATUS.ok,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeRoute(
  router: ReturnType<typeof createVmRouter>,
  method: string,
  path: string,
  request: { params?: Record<string, string> },
  response: TestResponse,
  next: (error?: unknown) => void,
): Promise<void> {
  type RouteLayer = {
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: RequestHandler }>;
    };
  };
  const route = (router as unknown as { stack: RouteLayer[] }).stack
    .map((layer) => layer.route)
    .find((candidate) => candidate?.path === path && candidate.methods[method.toLowerCase()]);
  assert.ok(route, `Route ${method} ${path} should exist`);
  await route.stack[0]?.handle(request as never, response as never, next);
}

test("returns the Proxmox inventory with HTTP 200", async () => {
  const virtualMachines: VirtualMachine[] = [
    { id: "100", name: "database-01", status: "running" },
  ];
  const router = createVmRouter({
    async listVirtualMachines() { return virtualMachines; },
    async startVirtualMachine() { return "task-id"; },
  } as ProxmoxClient);
  const response = createTestResponse();

  await invokeRoute(router, "get", "/vms", {}, response, () => {});

  assert.equal(response.statusCode, HTTP_STATUS.ok);
  assert.deepEqual(response.body, { virtualMachines });
});

test("rejects invalid VM IDs before calling Proxmox", async () => {
  let startCalls = 0;
  const router = createVmRouter({
    async listVirtualMachines() { return []; },
    async startVirtualMachine() {
      startCalls += 1;
      return "task-id";
    },
  } as ProxmoxClient);
  const response = createTestResponse();
  let routeError: unknown;

  await invokeRoute(router, "post", "/vms/:vmId/start", { params: { vmId: "0" } }, response, (error) => {
    routeError = error;
  });
  assert.ok(routeError);
  createErrorHandler()(routeError, {} as never, response as never, () => {});

  assert.equal(response.statusCode, HTTP_STATUS.badRequest);
  assert.equal(startCalls, 0);
  assert.deepEqual(response.body, {
    error: { code: "INVALID_VM_ID", message: "vmId must be a positive Proxmox VM ID" },
  });
});

test("returns the Proxmox task ID with HTTP 202 for a valid start request", async () => {
  let requestedVmId = "";
  const router = createVmRouter({
    async listVirtualMachines() { return []; },
    async startVirtualMachine(vmId) {
      requestedVmId = vmId;
      return "UPID:pve-a:00000001";
    },
  } as ProxmoxClient);
  const response = createTestResponse();

  await invokeRoute(router, "post", "/vms/:vmId/start", { params: { vmId: "100" } }, response, () => {});

  assert.equal(response.statusCode, HTTP_STATUS.accepted);
  assert.equal(requestedVmId, "100");
  assert.deepEqual(response.body, { taskId: "UPID:pve-a:00000001" });
});

test("maps a VM missing from the visible inventory to HTTP 404", async () => {
  const router = createVmRouter({
    async listVirtualMachines() { return []; },
    async startVirtualMachine(vmId) { throw new VirtualMachineNotFoundError(vmId); },
  } as ProxmoxClient);
  const response = createTestResponse();
  let routeError: unknown;

  await invokeRoute(router, "post", "/vms/:vmId/start", { params: { vmId: "100" } }, response, (error) => {
    routeError = error;
  });
  assert.ok(routeError);
  createErrorHandler()(routeError, {} as never, response as never, () => {});

  assert.equal(response.statusCode, HTTP_STATUS.notFound);
  assert.deepEqual(response.body, {
    error: {
      code: "VM_NOT_FOUND",
      message: "Virtual machine 100 is not visible in the Proxmox inventory; verify the VM ID and token access",
    },
  });
});
