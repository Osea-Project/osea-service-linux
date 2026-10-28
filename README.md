# osea-service-linux

Node.js microservice for Proxmox and other hypervisors.

This service implements the shared [Osea microservice API](https://github.com/Osea-Project/osea-contract/blob/main/openapi.yaml). The first proof of concept supports listing virtual machines and starting one by its ID.

## Requirements

- Node.js 22.9 or later
- A Proxmox VE API token with only the permissions needed to view and start the intended VMs
- Network access from this service to the Proxmox API

## Configure

Copy `.env.example` to `.env` and set `PVE_HOST`, `PVE_TOKEN_ID` and `PVE_TOKEN_SECRET`. `PVE_HOST` must be the HTTPS origin of a Proxmox node, including port 8006 when it is not the default. Do not commit `.env` or place token credentials in client applications.

For a Proxmox certificate signed by a private CA, set Node.js `NODE_EXTRA_CA_CERTS` to the CA certificate file. TLS verification stays enabled.

The service binds to `127.0.0.1:3000` by default. Set `SERVICE_HOST` and `SERVICE_PORT` to match the deployment network. Restrict network access so only the central Osea server can reach the service. Proxmox ACLs must also limit the API token to the intended resource pool and actions.

## Run

```sh
npm install
npm run dev
```

Build and run the compiled service with:

```sh
npm run build
npm start
```

Run the automated tests with:

```sh
npm test
```

## API

- `GET /v1/vms` lists VMs visible to the configured Proxmox token.
- `POST /v1/vms/{vmId}/start` starts a VM and returns the hypervisor task ID with HTTP `202`.

Errors use the shared `{ "error": { "code", "message" } }` shape. The contract defines the full request and response schemas.

## Current limits

The service connects to one Proxmox cluster at a time. VM IDs are Proxmox numeric IDs, represented as strings in the shared API. The start operation looks up the VM's current node and type before sending the action. Stop, create, edit, console access and task polling are outside this proof of concept.
