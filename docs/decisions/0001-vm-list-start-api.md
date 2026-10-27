# 0001: Use a small shared API for VM inventory and start

## Context

The project roadmap calls for a first proof of concept in which both hypervisor services can list and start a VM. The Linux service must implement the shared OpenAPI contract, and tenant visibility must stay constrained by central authorization and hypervisor ACLs.

## Decision

Define `GET /v1/vms` and `POST /v1/vms/{vmId}/start` in `osea-contract`. The inventory returns an opaque string ID, a display name and a normalized status. Starting a VM returns HTTP `202` and an opaque task ID. The Linux service resolves a VM's Proxmox node and kind from the current inventory before starting it.

The service uses the API token's Proxmox permissions as the inventory boundary. It does not add tenant authorization because the central server owns that policy and is the only allowed caller.

## Alternatives considered

- Putting Proxmox node and guest type in the shared VM schema would expose provider-specific data and require other microservices to invent values for those fields.
- Accepting node and guest type in the start request would let callers supply hypervisor routing details and would not match a provider-neutral operation.
- Returning a completed operation would be inaccurate because Proxmox starts VMs asynchronously and returns a task identifier.

## Trade-offs and limits

Resolving the VM at start time adds one inventory request, but keeps the contract provider-neutral and avoids trusting caller-supplied routing details. This proof of concept configures one Proxmox cluster per service instance and does not yet expose task polling.
