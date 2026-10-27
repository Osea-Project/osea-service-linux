import { z } from "zod";

const DEFAULT_SERVICE_HOST = "127.0.0.1";
const DEFAULT_SERVICE_PORT = 3000;
const PROXMOX_HTTPS_PROTOCOL = "https:";

const environmentSchema = z.object({
  SERVICE_HOST: z.string().trim().min(1).default(DEFAULT_SERVICE_HOST),
  SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_SERVICE_PORT),
  PVE_HOST: z.string().url(),
  PVE_TOKEN_ID: z.string().trim().min(1),
  PVE_TOKEN_SECRET: z.string().min(1),
});

export interface ServiceConfig {
  host: string;
  port: number;
  proxmoxHost: URL;
  proxmoxTokenId: string;
  proxmoxTokenSecret: string;
}

/** Reads service settings and rejects insecure or incomplete Proxmox configuration. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const invalidKeys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid service configuration for: ${invalidKeys}`);
  }

  const proxmoxHost = new URL(result.data.PVE_HOST);
  if (proxmoxHost.protocol !== PROXMOX_HTTPS_PROTOCOL) {
    throw new Error("PVE_HOST must use HTTPS to protect the Proxmox API token");
  }

  const hasProxmoxUrlDetails =
    proxmoxHost.username ||
    proxmoxHost.password ||
    proxmoxHost.pathname !== "/" ||
    proxmoxHost.search ||
    proxmoxHost.hash;
  if (hasProxmoxUrlDetails) {
    throw new Error("PVE_HOST must contain only the Proxmox HTTPS origin, without credentials or a path");
  }

  return {
    host: result.data.SERVICE_HOST,
    port: result.data.SERVICE_PORT,
    proxmoxHost,
    proxmoxTokenId: result.data.PVE_TOKEN_ID,
    proxmoxTokenSecret: result.data.PVE_TOKEN_SECRET,
  };
}
