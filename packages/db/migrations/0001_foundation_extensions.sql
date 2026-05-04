-- Slice 0 foundation migration.
-- This file establishes local PostgreSQL/PostGIS expectations only.
-- Later slices own domain tables, RBAC persistence, audit_events, and workflow state.

CREATE EXTENSION IF NOT EXISTS postgis;

-- migrate:down
DROP EXTENSION IF EXISTS postgis;
