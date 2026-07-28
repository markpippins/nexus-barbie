# Platform Operations Dashboard - System Drift & Architecture Report

**Environment**: `dev` branch  
**Last Audit Date**: 2026-07-28  
**Repository**: `markpippins/nexus-barbie`  
**Deployment Target**: Cloud Run / AI Studio (Port 3000)

---

## Executive Summary

This **Drift Report** details the current operational topology, API synchronization state, and architectural consistency across the Platform Operations Dashboard. The application manages operational metrics across **Systems**, **Services**, **Servers/Nodes**, **Deployments**, **Frameworks/Libraries**, and **Lookup Reference Tables**.

---

## 1. Branch & Source Control Status

- **Active Branch**: `dev`
- **Upstream Sync**: Synchronized with `origin/main` (commit `6d33536`)
- **Git Remote**: `https://github.com/markpippins/nexus-barbie.git`
- **Build Status**: Verified clean compile & zero linter errors.

---

## 2. API Architecture & Data Mode Parity

The application supports dual execution modes:
1. **Live REST API Mode (`live`)**: Connects to the Express backend (`server.ts`) serving live `/api/*` REST endpoints.
2. **Client Mock Mode (`mock`)**: Fallback in-memory state engine (`src/lib/mockData.ts`) for offline or client-only preview contexts.

### API Mode State Sync Status: **ALIGNED**
- **Central State**: Centralized in `App.tsx` via `apiMode` state.
- **UI Indicators**: Synchronized in both top `Navbar.tsx` and left `SidebarNav.tsx`.
- **Reactive Polling**: Re-fetches all entity endpoints automatically upon mode toggle or timer interval.

---

## 3. Endpoint & Entity Mapping Audit

| Entity Domain | REST API Endpoint | Mock Data Engine | Live vs Mock Parity | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Systems** | `GET/POST /api/systems` | `mockSystems` | Full Field Alignment | **Synced** |
| **Services** | `GET/POST /api/services` | `mockServices` | Full Field Alignment | **Synced** |
| **Servers** | `GET/POST /api/servers` | `mockServers` | Full Field Alignment | **Synced** |
| **Deployments** | `GET/POST /api/deployments` | `mockDeployments` | Full Field Alignment | **Synced** |
| **Frameworks** | `GET/POST /api/frameworks` | `mockFrameworks` | Full Field Alignment | **Synced** |
| **Lookup Tables** | `GET /api/lookup-tables` | `mockLookupTables` | Full Category Alignment | **Synced** |
| **System Metrics**| `GET /api/metrics` | `getMockMetrics()` | Calculated Dynamically | **Synced** |
| **Audit Logs** | `GET /api/audit-logs` | `mockAuditLogs` | Pre-seeded & Appended | **Synced** |

---

## 4. Operational Health & Resource Drift Analysis

### System Tier Health Overview
- **Tier 1 - Critical**:
  - `Payments & Financial Core` (`sys-01`): **Healthy** (3/3 services operational)
  - `Identity & Access Control` (`sys-02`): **Healthy** (2/2 services operational)
- **Tier 2 - Important**:
  - `Customer Experience & Catalog` (`sys-03`): **Degraded** (`catalog-search-svc` high latency)
  - `Data Pipeline & Real-Time Analytics` (`sys-04`): **Healthy** (2/2 services operational)
- **Tier 3 - Standard**:
  - `AI & Machine Learning Engine` (`sys-05`): **Critical** (`recommendation-engine-svc` model drift)

### Node Resource Threshold Drift
- `k8s-node-us-east-01` (`srv-01`): CPU 42%, Memory 68% - **Nominal**
- `db-primary-us-east` (`srv-02`): CPU 78%, Memory 89% - **Elevated Memory Usage**
- `edge-proxy-eu-west` (`srv-03`): CPU 91%, Memory 94% - **High Load Alert**
- `analytics-worker-us-central` (`srv-04`): CPU 31%, Memory 45% - **Nominal**

---

## 5. Summary of Recommended Actions

1. **Auto-Remediation Trigger**: Configure automatic fallback when node memory exceeds 90%.
2. **Staging Pipeline Validation**: Resolve `recommendation-engine-svc` model drift in `sys-05`.
3. **Database Maintenance**: Schedule index defragmentation for `db-primary-us-east`.
