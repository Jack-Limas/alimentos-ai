import type { HealthService, HealthStatus } from './health.service.js';

export interface HealthController {
  status: () => HealthStatus;
}

export function createHealthController(service: HealthService): HealthController {
  return {
    status: () => service.getStatus(),
  };
}
