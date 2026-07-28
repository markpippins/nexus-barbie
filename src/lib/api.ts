/**
 * Centralized REST API Client for Platform Operations Registry API
 * Targets /api/v1/registry/* for systems/registration/telemetry and /api/v1/* for flat entities
 * with support for switching between Live REST Backend mode and Client Mock mode.
 */

import {
  Service,
  Server,
  Deployment,
  Framework,
  Library,
  System,
  LookupEntry,
  LookupType,
  PaginatedResponse,
  LogEntry,
  MetricPoint,
  PlatformAggregateState,
  Environment,
  HealthStatus
} from '../types';

import {
  mockServices,
  mockServers,
  mockDeployments,
  mockSystems,
  mockFrameworks,
  mockLibraries,
  mockLookups,
  mockAggregateState
} from './mockData';

// Storage keys
const STORAGE_MODE_KEY = 'platform_api_mode';
const STORAGE_URL_KEY = 'platform_api_base_url';

let currentMode: 'live' | 'mock' = (localStorage.getItem(STORAGE_MODE_KEY) as 'live' | 'mock') || 'live';
let currentRegistryBaseUrl: string = localStorage.getItem(STORAGE_URL_KEY) || '/api/v1/registry';

function getFlatBaseUrl(): string {
  if (currentRegistryBaseUrl.endsWith('/registry')) {
    return currentRegistryBaseUrl.slice(0, -9);
  }
  if (currentRegistryBaseUrl.endsWith('/registry/')) {
    return currentRegistryBaseUrl.slice(0, -10);
  }
  return currentRegistryBaseUrl;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    ...options
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json();
}

// --- NORMALIZER HELPERS ---
function normalizeHealthStatus(status: any): HealthStatus {
  if (!status) return 'OFFLINE';
  const s = String(status).toUpperCase();
  if (['HEALTHY', 'ACTIVE', 'RUNNING', 'OK'].includes(s)) return 'ACTIVE';
  if (['DEGRADED', 'WARNING'].includes(s)) return 'DEGRADED';
  if (['CRITICAL', 'UNHEALTHY', 'ERROR', 'FAILED'].includes(s)) return 'CRITICAL';
  return 'OFFLINE';
}

function parseIntegerId(val: any, defaultId = 1): number {
  if (typeof val === 'number') return Math.floor(val);
  if (!val) return defaultId;
  const digits = String(val).replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : defaultId;
}

function normalizeService(s: any): Service {
  if (!s) return {} as Service;

  const fwObj = typeof s.framework === 'object' && s.framework !== null ? s.framework : null;
  const fwCategory = typeof fwObj?.category === 'object' ? fwObj.category : { id: 1, name: String(fwObj?.category || 'Backend Framework') };
  const fwLanguage = typeof fwObj?.language === 'object' ? fwObj.language : { id: 1, name: String(fwObj?.language || 'TypeScript') };
  const framework: FrameworkNested = {
    id: parseIntegerId(fwObj?.id || s.frameworkId, 1),
    name: fwObj?.name || (typeof s.framework === 'string' ? s.framework : (s.frameworkName || 'Node.js Express')),
    category: fwCategory,
    language: fwLanguage
  };

  const typeObj = typeof s.type === 'object' && s.type !== null ? s.type : null;
  const serviceType: ServiceTypeNested = {
    id: parseIntegerId(typeObj?.id || s.serviceTypeId, 1),
    name: typeObj?.name || (typeof s.type === 'string' ? s.type : (s.serviceType || 'Microservice'))
  };

  const parsedId = parseIntegerId(s.id, 1);

  return {
    id: parsedId,
    name: s.name || s.serviceName || `service-${parsedId}`,
    description: s.description || '',
    version: s.version || '1.0.0',
    status: normalizeHealthStatus(s.status ?? s.healthStatus),
    framework,
    type: serviceType,
    frameworkId: parseIntegerId(s.frameworkId || framework.id, 1),
    serviceTypeId: parseIntegerId(s.serviceTypeId || serviceType.id, 1),
    // Optional legacy display fallbacks
    systemName: s.systemName || (typeof s.system === 'object' ? s.system?.name : undefined),
    endpoint: s.endpoint,
    hostedServicesCount: s.hostedServicesCount ?? (Array.isArray(s.hostedServices) ? s.hostedServices.length : 0),
    hostedServices: Array.isArray(s.hostedServices) ? s.hostedServices : [],
    serverHostname: s.serverHostname || (typeof s.server === 'object' ? s.server?.hostname : undefined),
    rps: typeof s.rps === 'number' ? s.rps : undefined,
    latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : undefined,
    errorRate: typeof s.errorRate === 'number' ? s.errorRate : undefined,
    uptimePercent: typeof s.uptimePercent === 'number' ? s.uptimePercent : undefined
  };
}

function normalizeServer(s: any): Server {
  if (!s) return {} as Server;

  const typeObj = typeof s.type === 'object' && s.type !== null ? s.type : null;
  const serverType: ServerTypeNested = {
    id: parseIntegerId(typeObj?.id, 1),
    name: typeObj?.name || (typeof s.type === 'string' ? s.type : (s.serverType || 'c6i.2xlarge Compute Optimized'))
  };

  const envObj = typeof s.environmentType === 'object' && s.environmentType !== null ? s.environmentType : null;
  const envType: EnvironmentTypeNested = {
    id: parseIntegerId(envObj?.id, 1),
    name: envObj?.name || (typeof s.environmentType === 'string' ? s.environmentType : (s.environment || 'Production'))
  };

  const osObj = typeof s.operatingSystem === 'object' && s.operatingSystem !== null ? s.operatingSystem : null;
  const osType: OperatingSystemNested = {
    id: parseIntegerId(osObj?.id, 1),
    name: osObj?.name || (typeof s.operatingSystem === 'string' ? s.operatingSystem : 'Ubuntu 22.04 LTS')
  };

  const parsedId = parseIntegerId(s.id, 1);

  return {
    id: parsedId,
    hostname: s.hostname || s.name || `node-${parsedId}.internal`,
    ipAddress: s.ipAddress || s.ip || '10.0.0.1',
    cpuCores: typeof s.cpuCores === 'number' ? s.cpuCores : (s.cpuCores ? Number(s.cpuCores) : 8),
    type: serverType,
    environmentType: envType,
    operatingSystem: osType,
    name: s.name || s.hostname || `server-${parsedId}`,
    status: normalizeHealthStatus(s.status),
    // Optional legacy display fallbacks
    serverType: typeof serverType === 'object' ? serverType.name : String(serverType),
    datacenterRegion: s.datacenterRegion,
    cpuUsage: typeof s.cpuUsage === 'number' ? s.cpuUsage : undefined,
    memoryUsage: typeof s.memoryUsage === 'number' ? s.memoryUsage : undefined,
    diskUsage: typeof s.diskUsage === 'number' ? s.diskUsage : undefined,
    activePodsCount: typeof s.activePodsCount === 'number' ? s.activePodsCount : undefined,
    lastPing: s.lastPing
  };
}

function normalizeDeployment(d: any): Deployment {
  if (!d) return {} as Deployment;
  const svcName = d.serviceName || (typeof d.service === 'object' ? d.service?.name : d.service) || 'unknown-service';

  return {
    id: parseIntegerId(d.id, 1),
    serviceId: parseIntegerId(d.serviceId ?? d.service?.id, 1),
    serviceName: svcName,
    environment: (d.environment || 'production').toLowerCase() as Environment,
    version: d.version || 'v1.0.0',
    status: normalizeHealthStatus(d.status || d.healthStatus),
    deployedAt: d.deployedAt || d.createdAt || new Date().toISOString(),
    deployedBy: d.deployedBy || 'deploy-bot',
    replicasReady: d.replicasReady ?? d.replicas ?? 1,
    replicasTarget: d.replicasTarget ?? d.replicas ?? 1,
    commitHash: d.commitHash || 'main',
    clusterName: d.clusterName || 'prod-k8s'
  };
}

function normalizeFramework(f: any): Framework {
  if (!f) return {} as Framework;
  const cat = typeof f.category === 'object' ? f.category?.name : f.category;
  const lang = typeof f.language === 'object' ? f.language?.name : f.language;
  return {
    id: parseIntegerId(f.id, 1),
    name: f.name || 'Framework',
    category: cat || 'Backend',
    language: lang || 'TypeScript',
    version: f.version || '1.0.0',
    servicesCount: f.servicesCount ?? 0
  };
}

function normalizeLibrary(l: any): Library {
  if (!l) return {} as Library;
  const cat = typeof l.category === 'object' ? l.category?.name : l.category;
  const lang = typeof l.language === 'object' ? l.language?.name : l.language;
  return {
    id: parseIntegerId(l.id, 1),
    name: l.name || 'Library',
    category: cat || 'Utility',
    language: lang || 'TypeScript',
    version: l.version || '1.0.0',
    vulnerabilitiesCount: l.vulnerabilitiesCount ?? 0
  };
}

function normalizeSystem(sys: any): System {
  if (!sys) return {} as System;

  const sysTypeObj = typeof sys.systemType === 'object' && sys.systemType !== null ? sys.systemType : null;
  const systemType: SystemTypeNested = {
    id: parseIntegerId(sysTypeObj?.id, 1),
    name: sysTypeObj?.name || (typeof sys.systemType === 'string' ? sys.systemType : 'Core System Domain')
  };

  const parsedId = parseIntegerId(sys.id, 1);

  return {
    id: parsedId,
    name: sys.name || 'System Domain',
    description: sys.description || '',
    systemType,
    // Optional legacy display fallbacks
    owner: sys.owner,
    environment: sys.environment ? String(sys.environment).toLowerCase() as Environment : undefined,
    status: sys.status ? normalizeHealthStatus(sys.status) : undefined,
    servicesCount: sys.servicesCount,
    services: Array.isArray(sys.services) ? sys.services : [],
    tier: sys.tier
  };
}

function normalizeLookupEntry(lk: any, type: LookupType): LookupEntry {
  if (!lk) return {} as LookupEntry;
  return {
    id: parseIntegerId(lk.id, 1),
    lookupType: type,
    key: lk.key || lk.code || String(lk.id || 'key'),
    name: lk.name || lk.label || lk.key || 'Entry',
    description: lk.description || ''
  };
}

function normalizePaginatedResponse<T>(res: any, entityNormalizer: (item: any) => T): PaginatedResponse<T> {
  if (Array.isArray(res)) {
    const data = res.map(entityNormalizer);
    return {
      data,
      meta: { page: 1, size: data.length, totalItems: data.length, totalPages: 1, per_page: data.length, total: data.length, last_page: 1 }
    };
  }
  if (res && Array.isArray(res.data)) {
    const data = res.data.map(entityNormalizer);
    const meta = res.meta || {};
    const page = meta.page || meta.current_page || 1;
    const size = meta.per_page || meta.pageSize || meta.size || data.length || 10;
    const totalItems = meta.total ?? meta.totalItems ?? data.length;
    const totalPages = meta.last_page ?? meta.totalPages ?? (Math.ceil(totalItems / (size || 1)) || 1);
    return {
      data,
      meta: {
        page,
        size,
        totalItems,
        totalPages,
        per_page: size,
        total: totalItems,
        last_page: totalPages
      }
    };
  }
  return { data: [], meta: { page: 1, size: 0, totalItems: 0, totalPages: 1, per_page: 0, total: 0, last_page: 1 } };
}

export const registryApi = {
  // Mode & Configuration Controls
  getApiMode: (): 'live' | 'mock' => currentMode,
  setApiMode: (mode: 'live' | 'mock') => {
    currentMode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  },
  getApiBaseUrl: (): string => currentRegistryBaseUrl,
  setApiBaseUrl: (url: string) => {
    currentRegistryBaseUrl = url || '/api/v1/registry';
    localStorage.setItem(STORAGE_URL_KEY, currentRegistryBaseUrl);
  },

  // --- SERVICES ---
  getServices: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    system?: string;
    environment?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Service>> => {
    if (currentMode === 'mock') {
      let items = [...mockServices];
      if (params?.search) {
        const s = params.search.toLowerCase();
        items = items.filter(x => x.name.toLowerCase().includes(s) || x.type.toLowerCase().includes(s));
      }
      return {
        data: items,
        meta: { page: 1, size: items.length, totalItems: items.length, totalPages: 1 }
      };
    }

    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.system) query.append('system', params.system);
    if (params?.environment) query.append('environment', params.environment);
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services?${query.toString()}`);
    return normalizePaginatedResponse<Service>(raw, normalizeService);
  },

  getServicesWithHosted: async (size = 1000): Promise<PaginatedResponse<Service>> => {
    if (currentMode === 'mock') {
      return {
        data: mockServices,
        meta: { page: 1, size: mockServices.length, totalItems: mockServices.length, totalPages: 1 }
      };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/with-hosted?size=${size}`);
    return normalizePaginatedResponse<Service>(raw, normalizeService);
  },

  getServiceById: async (id: string): Promise<Service> => {
    if (currentMode === 'mock') {
      const found = mockServices.find(s => s.id === id) || mockServices[0];
      return found;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/${id}`);
    return normalizeService(raw);
  },

  getServiceDetails: async (serviceName: string): Promise<{ service: Service; deployments: Deployment[]; server?: Server }> => {
    if (currentMode === 'mock') {
      const svc = mockServices.find(s => s.name === serviceName) || mockServices[0];
      const deps = mockDeployments.filter(d => d.serviceName === serviceName);
      const srv = mockServers.find(s => s.id === svc.serverId);
      return { service: svc, deployments: deps, server: srv };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/${encodeURIComponent(serviceName)}/details`);
    return {
      service: normalizeService(raw?.service || raw),
      deployments: Array.isArray(raw?.deployments) ? raw.deployments.map(normalizeDeployment) : [],
      server: raw?.server ? normalizeServer(raw.server) : undefined
    };
  },

  getServicesByOperation: async (operation: string): Promise<{ data: Service[]; operation: string }> => {
    if (currentMode === 'mock') {
      return { data: mockServices, operation };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/by-operation/${encodeURIComponent(operation)}`);
    const dataList = Array.isArray(raw) ? raw : (raw?.data || []);
    return {
      data: dataList.map(normalizeService),
      operation: raw?.operation || operation
    };
  },

  createService: async (data: Partial<Service>): Promise<Service> => {
    if (currentMode === 'mock') {
      const newSvc: Service = {
        id: `svc-mock-${Date.now()}`,
        name: data.name || 'new-mock-svc',
        type: data.type || 'Microservice',
        version: data.version || '1.0.0',
        status: (data.status as HealthStatus) || 'healthy',
        systemId: data.systemId || 'sys-mock-01',
        systemName: data.systemName || 'Payments & Financial Core (Mock)',
        endpoint: data.endpoint || 'https://mock.internal/v1',
        environment: (data.environment as Environment) || 'production',
        hostedServicesCount: 0,
        hostedServices: [],
        frameworkId: 'fw-01',
        frameworkName: 'Node.js Express',
        serverId: 'srv-mock-01',
        serverHostname: 'mock-node-01',
        lastHeartbeat: new Date().toISOString(),
        uptimePercent: 100,
        rps: 10,
        errorRate: 0,
        latencyMs: 12,
        description: data.description || 'Mock created service'
      };
      mockServices.push(newSvc);
      return newSvc;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeService(raw);
  },

  updateService: async (id: string, data: Partial<Service>): Promise<Service> => {
    if (currentMode === 'mock') {
      const index = mockServices.findIndex(s => s.id === id);
      if (index !== -1) {
        mockServices[index] = { ...mockServices[index], ...data };
        return mockServices[index];
      }
      return mockServices[0];
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeService(raw);
  },

  deleteService: async (id: string): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const idx = mockServices.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServices.splice(idx, 1)[0] : mockServices[0];
      return { message: 'Mock deleted', service: removed };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/services/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'Deleted successfully',
      service: normalizeService(raw?.service || raw)
    };
  },

  // --- SERVERS ---
  getServers: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    environment?: string;
  }): Promise<PaginatedResponse<Server>> => {
    if (currentMode === 'mock') {
      return {
        data: mockServers,
        meta: { page: 1, size: mockServers.length, totalItems: mockServers.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/servers?${query.toString()}`);
    return normalizePaginatedResponse<Server>(raw, normalizeServer);
  },

  createServer: async (data: Partial<Server>): Promise<Server> => {
    if (currentMode === 'mock') {
      const srv: Server = {
        id: `srv-mock-${Date.now()}`,
        name: data.name || 'mock-server',
        hostname: data.hostname || 'mock-node.internal',
        ipAddress: data.ipAddress || '10.0.0.1',
        serverType: data.serverType || 'c6i.2xlarge',
        operatingSystem: 'Ubuntu 22.04 LTS',
        datacenterRegion: 'us-east-1',
        status: 'healthy',
        cpuUsage: 20,
        memoryUsage: 30,
        diskUsage: 15,
        activePodsCount: 5,
        lastPing: new Date().toISOString(),
        environment: 'production'
      };
      mockServers.push(srv);
      return srv;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/servers`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeServer(raw);
  },

  updateServer: async (id: string, data: Partial<Server>): Promise<Server> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      if (idx !== -1) mockServers[idx] = { ...mockServers[idx], ...data };
      return mockServers[0];
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeServer(raw);
  },

  deleteServer: async (id: string): Promise<{ message: string; server: Server }> => {
    if (currentMode === 'mock') {
      const idx = mockServers.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockServers.splice(idx, 1)[0] : mockServers[0];
      return { message: 'Mock server deleted', server: removed };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/servers/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'Server deleted successfully',
      server: normalizeServer(raw?.server || raw)
    };
  },

  // --- DEPLOYMENTS ---
  getDeployments: async (params?: {
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    environment?: string;
  }): Promise<PaginatedResponse<Deployment>> => {
    if (currentMode === 'mock') {
      return {
        data: mockDeployments,
        meta: { page: 1, size: mockDeployments.length, totalItems: mockDeployments.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.environment) query.append('environment', params.environment);

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/deployments?${query.toString()}`);
    return normalizePaginatedResponse<Deployment>(raw, normalizeDeployment);
  },

  createDeployment: async (data: Partial<Deployment>): Promise<Deployment> => {
    if (currentMode === 'mock') {
      const dep: Deployment = {
        id: `dep-mock-${Date.now()}`,
        serviceId: data.serviceId || 'svc-mock-01',
        serviceName: data.serviceName || 'mock-service',
        version: data.version || '1.0.0',
        clusterName: 'mock-k8s',
        replicasReady: 3,
        replicasTarget: 3,
        commitHash: 'm0ck999',
        deployedBy: 'Operator (Mock)',
        deployedAt: new Date().toISOString(),
        environment: 'production',
        status: 'healthy'
      };
      mockDeployments.push(dep);
      return dep;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/deployments`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeDeployment(raw);
  },

  updateDeployment: async (id: string, data: Partial<Deployment>): Promise<Deployment> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      if (idx !== -1) mockDeployments[idx] = { ...mockDeployments[idx], ...data };
      return mockDeployments[0];
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/deployments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeDeployment(raw);
  },

  deleteDeployment: async (id: string): Promise<{ message: string; deployment: Deployment }> => {
    if (currentMode === 'mock') {
      const idx = mockDeployments.findIndex(d => d.id === id);
      const removed = idx !== -1 ? mockDeployments.splice(idx, 1)[0] : mockDeployments[0];
      return { message: 'Mock deployment deleted', deployment: removed };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/deployments/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'Deployment deleted successfully',
      deployment: normalizeDeployment(raw?.deployment || raw)
    };
  },

  // --- FRAMEWORKS ---
  getFrameworks: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Framework>> => {
    if (currentMode === 'mock') {
      return {
        data: mockFrameworks,
        meta: { page: 1, size: mockFrameworks.length, totalItems: mockFrameworks.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/frameworks?${query.toString()}`);
    return normalizePaginatedResponse<Framework>(raw, normalizeFramework);
  },

  createFramework: async (data: Partial<Framework>): Promise<Framework> => {
    if (currentMode === 'mock') {
      const fw: Framework = {
        id: `fw-m-${Date.now()}`,
        name: data.name || 'Mock Framework',
        category: data.category || 'Backend',
        language: data.language || 'TypeScript',
        version: data.version || '1.0.0',
        servicesCount: 0
      };
      mockFrameworks.push(fw);
      return fw;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/frameworks`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeFramework(raw);
  },

  updateFramework: async (id: string, data: Partial<Framework>): Promise<Framework> => {
    if (currentMode === 'mock') return mockFrameworks[0];
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/frameworks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeFramework(raw);
  },

  deleteFramework: async (id: string): Promise<{ message: string; framework: Framework }> => {
    if (currentMode === 'mock') {
      const idx = mockFrameworks.findIndex(f => f.id === id);
      const removed = idx !== -1 ? mockFrameworks.splice(idx, 1)[0] : mockFrameworks[0];
      return { message: 'Mock framework deleted', framework: removed };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/frameworks/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'Framework deleted successfully',
      framework: normalizeFramework(raw?.framework || raw)
    };
  },

  // --- LIBRARIES ---
  getLibraries: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<Library>> => {
    if (currentMode === 'mock') {
      return {
        data: mockLibraries,
        meta: { page: 1, size: mockLibraries.length, totalItems: mockLibraries.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/libraries?${query.toString()}`);
    return normalizePaginatedResponse<Library>(raw, normalizeLibrary);
  },

  createLibrary: async (data: Partial<Library>): Promise<Library> => {
    if (currentMode === 'mock') {
      const lib: Library = {
        id: `lib-m-${Date.now()}`,
        name: data.name || 'Mock Library',
        category: data.category || 'Utility',
        language: data.language || 'TypeScript',
        version: data.version || '1.0.0',
        vulnerabilitiesCount: 0
      };
      mockLibraries.push(lib);
      return lib;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/libraries`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeLibrary(raw);
  },

  updateLibrary: async (id: string, data: Partial<Library>): Promise<Library> => {
    if (currentMode === 'mock') return mockLibraries[0];
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeLibrary(raw);
  },

  deleteLibrary: async (id: string): Promise<{ message: string; library: Library }> => {
    if (currentMode === 'mock') {
      const idx = mockLibraries.findIndex(l => l.id === id);
      const removed = idx !== -1 ? mockLibraries.splice(idx, 1)[0] : mockLibraries[0];
      return { message: 'Mock library deleted', library: removed };
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/libraries/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'Library deleted successfully',
      library: normalizeLibrary(raw?.library || raw)
    };
  },

  // --- SYSTEMS ---
  getSystems: async (params?: { page?: number; size?: number; search?: string }): Promise<PaginatedResponse<System>> => {
    if (currentMode === 'mock') {
      return {
        data: mockSystems,
        meta: { page: 1, size: mockSystems.length, totalItems: mockSystems.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));
    if (params?.search) query.append('search', params.search);

    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/systems?${query.toString()}`);
    return normalizePaginatedResponse<System>(raw, normalizeSystem);
  },

  createSystem: async (data: Partial<System>): Promise<System> => {
    if (currentMode === 'mock') {
      const sys: System = {
        id: `sys-mock-${Date.now()}`,
        name: data.name || 'Mock System Domain',
        description: data.description || 'Mock architecture domain',
        owner: data.owner || 'DevOps',
        tier: 'Tier 2 - Important',
        environment: 'production',
        status: 'healthy',
        servicesCount: 0,
        services: []
      };
      mockSystems.push(sys);
      return sys;
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/systems`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeSystem(raw);
  },

  updateSystem: async (id: string, data: Partial<System>): Promise<System> => {
    if (currentMode === 'mock') return mockSystems[0];
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/systems/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return normalizeSystem(raw);
  },

  deleteSystem: async (id: string): Promise<{ message: string; system: System }> => {
    if (currentMode === 'mock') {
      const idx = mockSystems.findIndex(s => s.id === id);
      const removed = idx !== -1 ? mockSystems.splice(idx, 1)[0] : mockSystems[0];
      return { message: 'Mock system deleted', system: removed };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/systems/${id}`, {
      method: 'DELETE'
    });
    return {
      message: raw?.message || 'System deleted successfully',
      system: normalizeSystem(raw?.system || raw)
    };
  },

  linkServiceToSystem: async (systemName: string, serviceName: string): Promise<any> => {
    if (currentMode === 'mock') {
      const sys = mockSystems.find(s => s.name === systemName);
      if (sys && !sys.services.includes(serviceName)) sys.services.push(serviceName);
      return { message: 'Mock service linked to system' };
    }
    return fetchJson(`${currentRegistryBaseUrl}/systems/${encodeURIComponent(systemName)}/services/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  // --- LOOKUP TABLES ---
  getLookupEntries: async (type: LookupType, params?: { page?: number; size?: number }): Promise<PaginatedResponse<LookupEntry>> => {
    if (currentMode === 'mock') {
      const list = mockLookups[type] || [];
      return {
        data: list,
        meta: { page: 1, size: list.length, totalItems: list.length, totalPages: 1 }
      };
    }
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.size) query.append('size', String(params.size));

    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/${type}?${query.toString()}`);
    return normalizePaginatedResponse<LookupEntry>(raw, (item) => normalizeLookupEntry(item, type));
  },

  createLookupEntry: async (type: LookupType, data: { key: string; name: string }): Promise<LookupEntry> => {
    if (currentMode === 'mock') {
      const entry: LookupEntry = { id: `lk-${Date.now()}`, lookupType: type, key: data.key, name: data.name };
      if (!mockLookups[type]) mockLookups[type] = [];
      mockLookups[type].push(entry);
      return entry;
    }
    const raw = await fetchJson<any>(`${getFlatBaseUrl()}/${type}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return normalizeLookupEntry(raw, type);
  },

  deleteLookupEntry: async (type: LookupType, id: string): Promise<{ message: string }> => {
    if (currentMode === 'mock') {
      if (mockLookups[type]) {
        mockLookups[type] = mockLookups[type].filter(x => x.id !== id);
      }
      return { message: 'Mock lookup deleted' };
    }
    return fetchJson(`${getFlatBaseUrl()}/${type}/${id}`, {
      method: 'DELETE'
    });
  },

  // --- REGISTRATION & HEARTBEAT ---
  registerService: async (data: {
    name: string;
    endpoint?: string;
    version?: string;
    systemName?: string;
    environment?: string;
  }): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const svc: Service = {
        id: `svc-reg-${Date.now()}`,
        name: data.name,
        type: 'Registered Microservice',
        version: data.version || '1.0.0',
        status: 'healthy',
        systemId: 'sys-mock-01',
        systemName: data.systemName || 'Payments & Financial Core (Mock)',
        endpoint: data.endpoint || 'https://api.internal/v1',
        environment: (data.environment as Environment) || 'production',
        hostedServicesCount: 0,
        hostedServices: [],
        frameworkId: 'fw-01',
        frameworkName: 'Node.js Express',
        serverId: 'srv-mock-01',
        serverHostname: 'mock-k8s-node-01',
        lastHeartbeat: new Date().toISOString(),
        uptimePercent: 100,
        rps: 0,
        errorRate: 0,
        latencyMs: 10,
        description: 'Mock registered service'
      };
      mockServices.push(svc);
      return { message: 'Mock registered', service: svc };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/register`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return {
      message: raw?.message || 'Registered',
      service: normalizeService(raw?.service || raw)
    };
  },

  sendHeartbeat: async (serviceName: string): Promise<{ message: string; timestamp: string; status: string }> => {
    if (currentMode === 'mock') {
      return { message: 'Mock heartbeat acknowledged', timestamp: new Date().toISOString(), status: 'healthy' };
    }
    return fetchJson(`${currentRegistryBaseUrl}/heartbeat/${encodeURIComponent(serviceName)}`, {
      method: 'POST'
    });
  },

  deregisterServiceGraceful: async (serviceName: string): Promise<{ message: string; service: Service }> => {
    if (currentMode === 'mock') {
      const idx = mockServices.findIndex(s => s.name === serviceName);
      const removed = idx !== -1 ? mockServices.splice(idx, 1)[0] : mockServices[0];
      return { message: 'Mock deregistered', service: removed };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/deregister/${encodeURIComponent(serviceName)}/graceful`, {
      method: 'POST'
    });
    return {
      message: raw?.message || 'Deregistered',
      service: normalizeService(raw?.service || raw)
    };
  },

  // --- AGGREGATE PLATFORM STATE ---
  getPlatformAggregate: async (): Promise<PlatformAggregateState> => {
    if (currentMode === 'mock') {
      return {
        ...mockAggregateState,
        totalServices: mockServices.length,
        totalServers: mockServers.length,
        totalDeployments: mockDeployments.length
      };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/aggregate`);
    const nodes = Array.isArray(raw?.nodes)
      ? raw.nodes.map((n: any) => ({
          ...n,
          id: String(n.id),
          status: normalizeHealthStatus(n.status)
        }))
      : [];
    const edges = Array.isArray(raw?.edges)
      ? raw.edges.map((e: any) => ({
          ...e,
          id: String(e.id),
          source: String(e.source),
          target: String(e.target),
          status: normalizeHealthStatus(e.status)
        }))
      : [];

    return {
      totalSystems: raw?.totalSystems ?? 0,
      totalServices: raw?.totalServices ?? 0,
      totalServers: raw?.totalServers ?? 0,
      totalDeployments: raw?.totalDeployments ?? 0,
      healthyCount: raw?.healthyCount ?? 0,
      degradedCount: raw?.degradedCount ?? 0,
      criticalCount: raw?.criticalCount ?? 0,
      offlineCount: raw?.offlineCount ?? 0,
      overallHealthPercent: raw?.overallHealthPercent ?? 100,
      avgLatencyMs: raw?.avgLatencyMs ?? 0,
      totalRps: raw?.totalRps ?? 0,
      activeIncidentsCount: raw?.activeIncidentsCount ?? 0,
      nodes,
      edges
    };
  },

  // --- LOGS & METRICS ---
  getLogs: async (entityType: string, entityId: string): Promise<{ logs: LogEntry[] }> => {
    if (currentMode === 'mock') {
      return {
        logs: [
          { id: 'l1', timestamp: new Date().toISOString(), level: 'info', message: `[MOCK LOG] Service ${entityId} initialized cleanly.` },
          { id: 'l2', timestamp: new Date(Date.now() - 5000).toISOString(), level: 'info', message: `[MOCK LOG] Database connection pool established.` },
          { id: 'l3', timestamp: new Date(Date.now() - 15000).toISOString(), level: 'debug', message: `[MOCK LOG] Handling inbound heartbeat ACK.` }
        ]
      };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/logs/${entityType}/${encodeURIComponent(entityId)}`);
    const list = Array.isArray(raw?.logs) ? raw.logs : Array.isArray(raw) ? raw : [];
    return {
      logs: list.map((l: any, i: number) => ({
        id: String(l.id ?? `log-${i}`),
        timestamp: l.timestamp || new Date().toISOString(),
        level: (['info', 'warn', 'error', 'debug'].includes(String(l.level).toLowerCase()) ? String(l.level).toLowerCase() : 'info') as any,
        message: l.message || '',
        serviceName: l.serviceName || entityId,
        serverId: l.serverId,
        traceId: l.traceId
      }))
    };
  },

  getMetrics: async (entityType: string, entityId: string): Promise<{ metrics: MetricPoint[] }> => {
    if (currentMode === 'mock') {
      const now = Date.now();
      return {
        metrics: Array.from({ length: 10 }, (_, i) => {
          const time = new Date(now - (9 - i) * 10000);
          return {
            timestamp: time.toISOString(),
            timeLabel: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: Math.floor(Math.random() * 30 + 20),
            memory: Math.floor(Math.random() * 20 + 50),
            rps: Math.floor(Math.random() * 200 + 400),
            latency: Math.floor(Math.random() * 10 + 15),
            errorRate: 0.1
          };
        })
      };
    }
    const raw = await fetchJson<any>(`${currentRegistryBaseUrl}/metrics/${entityType}/${encodeURIComponent(entityId)}`);
    const list = Array.isArray(raw?.metrics) ? raw.metrics : Array.isArray(raw) ? raw : [];
    return {
      metrics: list.map((m: any) => ({
        timestamp: m.timestamp || new Date().toISOString(),
        timeLabel: m.timeLabel || new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cpu: typeof m.cpu === 'number' ? m.cpu : 0,
        memory: typeof m.memory === 'number' ? m.memory : 0,
        latency: typeof m.latency === 'number' ? m.latency : 0,
        errorRate: typeof m.errorRate === 'number' ? m.errorRate : 0,
        rps: typeof m.rps === 'number' ? m.rps : 0
      }))
    };
  }
};
