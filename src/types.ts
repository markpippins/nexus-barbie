/**
 * Platform Operations Dashboard - Core Data Contracts & Interfaces
 */

export type ThemeMode = 'dark' | 'light' | 'steel';

export type HealthStatus = 'ACTIVE' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE' | 'healthy' | 'degraded' | 'critical' | 'offline';

export type Environment = 'production' | 'staging' | 'development' | 'qa';

export interface CategoryNested {
  id?: number;
  name?: string;
}

export interface LanguageNested {
  id?: number;
  name?: string;
}

export interface FrameworkNested {
  id?: number;
  name?: string;
  category?: CategoryNested | string;
  language?: LanguageNested | string;
}

export interface ServiceTypeNested {
  id?: number;
  name?: string;
}

export interface ServerTypeNested {
  id?: number;
  name?: string;
}

export interface EnvironmentTypeNested {
  id?: number;
  name?: string;
}

export interface OperatingSystemNested {
  id?: number;
  name?: string;
}

export interface SystemTypeNested {
  id?: number;
  name?: string;
}

export interface Service {
  id: number;
  name: string;
  description?: string;
  version: string;
  status: HealthStatus;
  framework?: FrameworkNested;
  type?: ServiceTypeNested | string;
  frameworkId?: number;
  serviceTypeId?: number;
  // Optional legacy display helpers
  systemName?: string;
  endpoint?: string;
  hostedServicesCount?: number;
  hostedServices?: string[];
  serverHostname?: string;
  rps?: number;
  latencyMs?: number;
  errorRate?: number;
  uptimePercent?: number;
}

export interface Server {
  id: number;
  hostname: string;
  ipAddress: string;
  cpuCores?: number;
  type?: ServerTypeNested | string;
  environmentType?: EnvironmentTypeNested | string;
  operatingSystem?: OperatingSystemNested | string;
  name?: string;
  status?: HealthStatus;
  // Optional legacy display helpers
  serverType?: string;
  datacenterRegion?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  activePodsCount?: number;
  lastPing?: string;
  environment?: Environment;
}

export interface Deployment {
  id: string | number;
  serviceId: string | number;
  serviceName: string;
  environment: Environment;
  version: string;
  status: HealthStatus;
  deployedAt: string;
  deployedBy: string;
  replicasReady: number;
  replicasTarget: number;
  commitHash: string;
  clusterName: string;
}

export interface Framework {
  id: string | number;
  name: string;
  category: string | CategoryNested;
  language: string | LanguageNested;
  version: string;
  servicesCount?: number;
}

export interface Library {
  id: string | number;
  name: string;
  category: string | CategoryNested;
  language: string | LanguageNested;
  version: string;
  vulnerabilitiesCount: number;
}

export interface System {
  id: number;
  name: string;
  description: string;
  systemType?: SystemTypeNested | string;
  // Optional legacy display helpers
  owner?: string;
  environment?: Environment;
  status?: HealthStatus;
  servicesCount?: number;
  services?: string[];
  tier?: string;
}

export type LookupType =
  | 'server-types'
  | 'environments'
  | 'operating-systems'
  | 'service-types'
  | 'framework-categories'
  | 'framework-languages'
  | 'library-categories'
  | 'library-languages';

export interface LookupEntry {
  id: string | number;
  lookupType: LookupType;
  key: string;
  name: string;
  description?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  serviceName?: string;
  serverId?: string;
  traceId?: string;
}

export interface MetricPoint {
  timestamp: string;
  timeLabel: string;
  cpu: number;
  memory: number;
  latency: number;
  errorRate: number;
  rps: number;
}

export interface EntitySelection {
  type: 'service' | 'server' | 'deployment' | 'system' | 'framework' | 'library';
  id: string | number;
  name: string;
  data?: any;
}

export interface PaginationMeta {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  per_page?: number;
  total?: number;
  last_page?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PlatformAggregateState {
  totalSystems: number;
  totalServices: number;
  totalServers: number;
  totalDeployments: number;
  healthyCount: number;
  degradedCount: number;
  criticalCount: number;
  offlineCount: number;
  overallHealthPercent: number;
  avgLatencyMs: number;
  totalRps: number;
  activeIncidentsCount: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TopologyNode {
  id: string;
  label: string;
  type: 'system' | 'service' | 'server';
  status: HealthStatus;
  systemName?: string;
  metricsSummary?: string;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  status: HealthStatus;
}
