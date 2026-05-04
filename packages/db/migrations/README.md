# Migration Convention

Migration files use `NNNN_descriptive_name.sql` and must include a `-- migrate:down` marker.

Slice 0 intentionally contains only a foundation PostGIS extension expectation. Domain tables, identity/RBAC persistence, audit events, organisations, parks, applications, assessment episodes, and workflow state belong to later backlog slices.
