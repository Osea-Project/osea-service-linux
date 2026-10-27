import express from "express";
import { loadConfig } from "./config.js";
import { createErrorHandler } from "./http-error-handler.js";
import { HTTP_STATUS } from "./http-status.js";
import { ProxmoxClient } from "./proxmox-client.js";
import { createVmRouter } from "./vm-routes.js";

const API_VERSION_PATH = "/v1";

function startServer(): void {
  const config = loadConfig();
  const app = express();
  const proxmoxClient = new ProxmoxClient(config);

  app.use(API_VERSION_PATH, createVmRouter(proxmoxClient));
  app.use((_request, response) => {
    response.status(HTTP_STATUS.notFound).json({
      error: { code: "ROUTE_NOT_FOUND", message: "The requested API route does not exist" },
    });
  });
  app.use(createErrorHandler());
  app.listen(config.port, config.host, () => {
    console.info(`Osea Linux service listening on ${config.host}:${config.port}`);
  });
}

try {
  startServer();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Could not start Osea Linux service: ${message}`);
  process.exitCode = 1;
}
