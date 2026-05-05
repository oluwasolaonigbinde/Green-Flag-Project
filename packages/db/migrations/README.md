# Migration Convention

Migration files use `NNNN_descriptive_name.sql` and must include a `-- migrate:down` marker.

Slice 0 intentionally contains only a foundation PostGIS extension expectation. Slice 1 adds the approved identity/RBAC/audit foundation tables (`internal_users`, `cognito_identity_links`, `role_assignments`, `audit_events`). Later domain tables, organisations, parks, applications, assessment episodes, and workflow state belong to later backlog slices.
