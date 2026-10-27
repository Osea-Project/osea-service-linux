import type { ErrorRequestHandler } from "express";
import { HttpError, ProxmoxApiError, VirtualMachineNotFoundError } from "./errors.js";
import { HTTP_STATUS } from "./http-status.js";

/** Converts known service failures to the shared error response shape. */
export function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
      return;
    }

    if (error instanceof VirtualMachineNotFoundError) {
      response.status(HTTP_STATUS.notFound).json({
        error: { code: "VM_NOT_FOUND", message: error.message },
      });
      return;
    }

    if (error instanceof ProxmoxApiError) {
      response.status(HTTP_STATUS.badGateway).json({
        error: { code: "PROXMOX_ERROR", message: error.message },
      });
      return;
    }

    console.error("Unexpected Osea Linux service error", error);
    response.status(HTTP_STATUS.internalServerError).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected service error occurred" },
    });
  };
}
