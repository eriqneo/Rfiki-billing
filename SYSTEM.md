# Nexus ERP System Documentation

This document provides a comprehensive overview of the Nexus ERP system architecture, modules, and data structures.

## System Architecture

Nexus is built as a **Local-First Progressive Web Application** using:
- **Frontend**: Vite + React 18 + Tailwind CSS.
- **State Management**: React Hooks + Dexie.js (IndexedDB).
- **Database**: Offline-first architecture using Dexie, with a background synchronization queue (`pending_sync` and `syncQueue`).
- **Integrations**: 
  - **Google Calendar API**: Real-time meeting scheduling and synchronization.
  - **Cloud Infrastructure**: Management of "PocketHost" instances.

---

## Core Data Schema (`/src/db/db.ts`)

The system uses a unified database schema defined in `NexusDatabase`:

### Main Entities
| Entity | Purpose | Key Fields |
| :--- | :--- | :--- |
| **Clients** | Master CRM records | `node_id`, `name`, `agreed_price`, `app_built`, `project_tag` |
| **PocketHostInstance** | Cloud infrastructure nodes | `instance_name`, `client_id`, `monthly_fee`, `billing_cycle`, `status` |
| **Expenses** | Operating costs | `category`, `amount`, `client_id`, `sub_tag` |
| **Payments** | Revenue tracking | `client_id`, `amount`, `method`, `transaction_id` |
| **PaymentPromise** | Account receivables (Billing) | `amount_due`, `due_date`, `status` (fulfilled/pending/broken) |
| **Meetings** | Calendar events | `google_id`, `client_id`, `start_time`, `type` |
| **Agreements** | Contract management | `client_id`, `file_path`, `status` |

---

## Service Layer (`/src/services`)

### 1. `billingService.ts`
Handles complex financial logic.
- **Functions**:
  - `generateInvoice()`: Creates PDF/Statement logic (placeholder/planned).
  - `calculateYields()`: Aggregates revenue across billing cycles.

### 2. `googleCalendarService.ts`
Direct integration with Google Calendar.
- **Functions**:
  - `scheduleMeeting()`: Handles OAuth and event creation.
  - `fetchMeetings()`: Synchronizes external events into the local database.

---

## React Hooks (`/src/hooks`)

### `useSync`
The heart of the offline-first logic.
- **`addEntity(entity, data)`**: Adds record to local DB and appends to `syncQueue`.
- **`updateEntity(entity, id, data)`**: Updates local record and marks for sync.
- **`deleteEntity(entity, id)`**: Deletes local record and logs for remote deletion.
- **`processSyncQueue()`**: Background process that attempts to push local changes to remote services when `navigator.onLine` is true.

### `useClientData`
A high-level selector hook that retrieves unified views (e.g., a client with all their associated payments and instances).

---

## Application Modules (`/src/views`)

### Navigation & Identity
- **`App.tsx`**: Orchestrates view switching and performs **Initial Data Seeding** (populating local DB with defaults if empty).
- **`Sidebar.tsx`**: Provides terminal-style navigation with real-time sync status indicators.

### 1. Dashboard (`Dashboard.tsx`)
- **KPI Cards**: Displays Total Revenue, Active Agreements, and Overdue Promises.
- **Visuals**: Usage charts using Recharts.
- **Activity**: Feed of recent database mutations.

### 2. PocketHost (`PocketHost.tsx`)
Infrastructure management module.
- **Inventory STOCK Tab**: Unassigned nodes (hardware/cloud awaiting assignment).
- **Active Tenants Tab**: Nodes currently allocated to clients.
- **Bulk Selection**: Assigning stock units to specific tenants.
- **Financial metrics**: Cycle-specific yields (Monthly, Quarterly, Semi-Annual, Yearly) and Aggregate MRR.
- **Pagination**: Supports 9 items per page with active navigation.

### 3. Client Hub (`ClientHub.tsx`)
- **CRM Interface**: Detailed drill-down into client history.
- **Node ID Association**: Linking physical hardware (Node ID) to business entities.

### 4. Billing (`Billing.tsx`)
- **Promise Tracking**: Management of "Payment Promises" (Accounts Receivable).
- **Payment Logging**: Fast entry for Mpesa, Bank, and Cash transactions.

### 5. Settings (`Settings.tsx`)
- **Business Profile**: App globally identifies as the configured business name/till.
- **Team Management**: Role-based access control (Admin/Editor/Viewer).
- **Bulk Provisioning**: Special administration tool to "Inject" multiple nodes into the PocketHost inventory with custom naming prefixes.

---

## Themes & Styling
- **ThemeContext**: Supports System/Dark/Light modes.
- **Glassmorphism**: Consistent UI language using `glass-panel` utilities for depth and technical feel.
- **Animations**: `motion/react` (Framer Motion) for layout transitions and staggered grid entrances.
