import { Router } from "express";
import { z } from "zod";
import { HttpError } from "./errors.js";
import { HTTP_STATUS } from "./http-status.js";
import type { ProxmoxClient } from "./proxmox-client.js";

// Matches positive numeric IDs such as "100" and "9000"; rejects zero and non-digits.
const vmIdSchema = z.string().regex(/^[1-9]\d*$/);

/** Creates the inventory and VM start routes defined by the shared OpenAPI contract. */
export function createVmRouter(proxmoxClient: ProxmoxClient): Router {
  const router = Router();

  router.get("/vms", async (_request, response, next) => {
    try {
      const virtualMachines = await proxmoxClient.listVirtualMachines();
      response.status(HTTP_STATUS.ok).json({ virtualMachines });
    } catch (error) {
      next(error);
    }
  });

  router.post("/vms/:vmId/start", async (request, response, next) => {
    const vmId = vmIdSchema.safeParse(request.params.vmId);
    if (!vmId.success) {
      next(
        new HttpError(
          HTTP_STATUS.badRequest,
          "INVALID_VM_ID",
          "vmId must be a positive Proxmox VM ID",
        ),
      );
      return;
    }

    try {
      const taskId = await proxmoxClient.startVirtualMachine(vmId.data);
      response.status(HTTP_STATUS.accepted).json({ taskId });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
