# Nexus ERP System Documentation

This document provides a comprehensive overview of the Nexus ERP system architecture, modules, and data structures.

## System Architecture: Hybrid Cloud-Local Convergence

Nexus is built as a **Locally-True, Cloud-Convergent PWA**. This architecture prioritizes zero-latency user interaction while ensuring institutional-grade data durability.

### Core Stack
- **Frontend**: Vite + React 18 + Vanilla CSS (Premium Aesthetics).
- **Local Persistence**: Dexie.js (IndexedDB v18) — Acts as the primary "Truth" for UI rendering.
- **Cloud Backend**: PocketBase (via Pockethost.io) — Acts as the "Master Vault" for cross-device synchronization.
- **Sync Protocol**: Custom `useSync` queuing engine with background auto-recovery.

---

## Technical Hardening (May 2026 Updates)

### 1. Database Migration (v18)
To resolve browser-level `DataError` crashes, the schema was migrated to Version 18.
- **Index Optimization**: Removed `synced` (boolean) from IndexedDB indices. Boolean indexing is unstable in certain Webkit/Chromium environments.
- **Performance**: High-cardinality fields like `pb_id` and `client_id` remain indexed for fast lookups.

### 2. Synchronization Engine (Deep Audit & Repair)
The system now features a robust "Sync Handshake" protocol:
- **Auto-Recovery Sync Sweep**: On application startup, the system audits all local records. Any "Orphaned" records (locally marked as synced but missing a Cloud ID) are automatically re-queued for upload.
- **Sync Repair Tool**: Accessible via **Settings**, this manually triggers a deep reconciliation of the 248+ infrastructure nodes and financial records.
- **Optimistic UI Merging**: The `useUnifiedCollection` hook prioritizes local unsynced records over cloud data to prevent "Ghosting" or flickering during network latency.

### 3. Authentication & Security
- **Dual-Layer Auth**: Supports both Local-DB login (for full offline access) and PocketBase Auth (for Cloud Sync).
- **Status Awareness**: Real-time Sidebar indicators (**🟢 Cloud Active** vs **🟡 Local Only**) ensure users know exactly where their data is stored.

---

## Core Data Schema (`/src/db/db.ts`)

### Main Entities
| Entity | Purpose | Key Fields |
| :--- | :--- | :--- |
| **Clients** | Master CRM records | `node_id`, `name`, `agreed_price`, `app_built`, `project_tag` |
| **PocketHostInstance** | Cloud infrastructure nodes | `instance_name`, `client_id`, `monthly_fee`, `billing_cycle`, `status` |
| **Expenses** | Operating costs | `category`, `amount`, `client_id`, `sub_tag` |
| **Payments** | Revenue tracking | `client_id`, `amount`, `method`, `transaction_id` |
| **PaymentPromise** | Account receivables (Billing) | `amount_due`, `due_date`, `status` (fulfilled/pending/broken) |

---

## Application Modules (`/src/views`)

### 1. PocketHost Module (Hardware Management)
- **Nodal Inventory**: Management of 248+ server instances.
- **Dynamic Assignment**: Drag-and-drop style assignment of cloud hardware to specific clients.
- **Financial Yields**: Real-time calculation of Monthly vs Yearly yields to track infrastructure ROI.

### 2. Billing & Expenses
- **Unified Ledger**: Tracks cashflow with Mpesa/Bank/Cash support.
- **Edit Functionality**: Production-ready inline editing for all financial transactions.
- **Local-First Saving**: Transactions are saved instantly to the device and queued for the cloud in the background.

### 3. Settings & Administration
- **Cloud Integrity**: One-click repair tool for fixing data drift.
- **Bulk Provisioning**: Tool to "Inject" hundreds of nodes into inventory using custom prefixes (e.g., `host-unit-X`).
- **Brand Identity**: Customizable business logo, currency (KES/USD), and Mpesa Till numbers.

---

## Performance & UX Design
- **Premium Glassmorphism**: High-fidelity UI using depth, blur, and neon accents (`shadow-neon`).
- **Micro-Animations**: Framer Motion (motion/react) used for state transitions to provide an "App-like" feel.
- **PWA Ready**: Offline-first service worker allows the system to be installed as a standalone desktop/mobile app.

---

## Deployment & Production
- **Hosting**: Optimized for Vercel with automated GitHub CI/CD.
- **Environment Management**: Hardened `.env` configuration for `VITE_AUTH_MODE` (PocketBase vs Local).
- **SEO & Identity**: Complete favicon/manifest suite for institutional branding.
