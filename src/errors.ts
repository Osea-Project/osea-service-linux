export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ProxmoxApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProxmoxApiError";
  }
}

export class VirtualMachineNotFoundError extends Error {
  constructor(vmId: string) {
    super(`Virtual machine ${vmId} is not visible in the Proxmox inventory; verify the VM ID and token access`);
    this.name = "VirtualMachineNotFoundError";
  }
}
