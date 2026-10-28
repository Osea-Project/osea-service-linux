import { z } from "zod";
import type { ServiceConfig } from "./config.js";
import { ProxmoxApiError, VirtualMachineNotFoundError } from "./errors.js";

const PROXMOX_API_PREFIX = "/api2/json";
const REQUEST_TIMEOUT_MS = 15_000;
const VM_TYPE_VALUES = ["qemu", "lxc"] as const;
const VM_STATUS = {
  running: "running",
  stopped: "stopped",
  unknown: "unknown",
} as const;

const vmResourceSchema = z.object({
  vmid: z.number().int().positive(),
  name: z.string().nullable().optional(),
  node: z.string().min(1),
  type: z.enum(VM_TYPE_VALUES),
  status: z.string().nullable().optional(),
});

const vmResourcesSchema = z.array(vmResourceSchema);

export interface VirtualMachine {
  id: string;
  name: string;
  status: (typeof VM_STATUS)[keyof typeof VM_STATUS];
}

/** Calls the configured Proxmox cluster using its scoped API token. */
export class ProxmoxClient {
  constructor(private readonly config: ServiceConfig) {}

  /** Returns the virtual machines visible to the Proxmox token. */
  async listVirtualMachines(): Promise<VirtualMachine[]> {
    const resources = await this.request("/cluster/resources?type=vm");
    const parsedResources = vmResourcesSchema.safeParse(resources);
    if (!parsedResources.success) {
      throw new ProxmoxApiError("Proxmox returned an invalid virtual machine inventory");
    }

    return parsedResources.data.map((resource) => ({
      id: String(resource.vmid),
      name: resource.name ?? String(resource.vmid),
      status: this.mapStatus(resource.status),
    }));
  }

  /** Starts a VM by resolving its node and type from the cluster inventory. */
  async startVirtualMachine(vmId: string): Promise<string> {
    const resources = await this.request("/cluster/resources?type=vm");
    const parsedResources = vmResourcesSchema.safeParse(resources);
    if (!parsedResources.success) {
      throw new ProxmoxApiError("Proxmox returned an invalid virtual machine inventory");
    }

    const resource = parsedResources.data.find((vm) => String(vm.vmid) === vmId);
    if (!resource) throw new VirtualMachineNotFoundError(vmId);

    const taskId = await this.request(
      `/nodes/${encodeURIComponent(resource.node)}/${resource.type}/${resource.vmid}/status/start`,
      "POST",
    );
    const parsedTaskId = z.string().safeParse(taskId);
    if (!parsedTaskId.success) {
      throw new ProxmoxApiError("Proxmox returned an invalid start task identifier");
    }

    return parsedTaskId.data;
  }

  private mapStatus(status?: string | null): VirtualMachine["status"] {
    if (status === VM_STATUS.running) return VM_STATUS.running;
    if (status === VM_STATUS.stopped) return VM_STATUS.stopped;
    return VM_STATUS.unknown;
  }

  private async request(path: string, method = "GET"): Promise<unknown> {
    const endpoint = new URL(`${PROXMOX_API_PREFIX}${path}`, this.config.proxmoxHost);
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `PVEAPIToken=${this.config.proxmoxTokenId}=${this.config.proxmoxTokenSecret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProxmoxApiError(
        `Could not reach Proxmox at ${this.config.proxmoxHost.origin}; ` +
          `check network access, TLS trust and the ${REQUEST_TIMEOUT_MS} ms timeout`,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new ProxmoxApiError(
        `Proxmox ${method} request to ${endpoint.pathname} failed with HTTP ${response.status}; ` +
          "check cluster availability and API token permissions",
      );
    }

    try {
      const payload: unknown = await response.json();
      return z.object({ data: z.unknown() }).parse(payload).data;
    } catch (error) {
      throw new ProxmoxApiError("Proxmox returned an invalid API response", { cause: error });
    }
  }
}
