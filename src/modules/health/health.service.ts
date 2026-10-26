export interface HealthStatus {
  status: 'ok';
  service: 'alimentos-ai';
  version: string;
  model: string | null;
  geminiConfigured: boolean;
}

export interface HealthServiceDeps {
  version: string;
  geminiModel: string | undefined;
  geminiConfigured: boolean;
}

export interface HealthService {
  getStatus(): HealthStatus;
}

export function createHealthService(deps: HealthServiceDeps): HealthService {
  return {
    // Only reports whether a Gemini key exists; never its value.
    getStatus: () => ({
      status: 'ok',
      service: 'alimentos-ai',
      version: deps.version,
      model: deps.geminiModel ?? null,
      geminiConfigured: deps.geminiConfigured,
    }),
  };
}
