# Figma file manifest — Phase 1

**Source:** [GreenFlag — Figma](https://www.figma.com/design/SucbJ5dh3Pt0zKEMAL1YcG/GreenFlag?node-id=0-1&p=f&m=dev)  
**File key:** `SucbJ5dh3Pt0zKEMAL1YcG`  
**Root node (URL):** `0:1` → canvas **Page 1**  
**Generated from:** Figma MCP `get_metadata` (structure only — no pixels or styles in this artifact)

## PNG exports — canonical offline reference

**Folder:** [`docs/figma/`](./figma/) (paths below are relative to that folder)

Use these PNGs as **implementation source of truth** when live Figma/MCP is unavailable, rate-limited, or you need stable pixel references in repo. Filenames mirror export spelling from design (e.g. `Appicant`, `Dasboard`, `Archieve`, `Evalution`, `Accreditaion`).

**Applicant**

| File |
|------|
| `Appicant - Application - Payment.png` |
| `Appicant - Application - Submitted.png` |
| `Appicant - Application - Submitted-1.png` |
| `Applicant  - Applications.png` |
| `Applicant - Application - Application details.png` |
| `Applicant - Application - Application details - Mystery Shopping.png` |
| `Applicant - Application - contact details.png` |
| `Applicant - Application - Document.png` |
| `Applicant - Application - Green Heritage Accreditaion.png` |
| `Applicant - Application - Location.png` |
| `Applicant - Application - Location-1.png` |
| `Applicant - Application - Location-2.png` |
| `Applicant - Application - Optional Information.png` |
| `Applicant - Application - publicity.png` |
| `Applicant - Application - Review & submit.png` |
| `Applicant - Application - Site Information.png` |
| `Applicant - Award category - details.png` |
| `Applicant - Award category - details-1.png` |
| `Applicant - Award category - details-2.png` |
| `Applicant - Award category - details-3.png` |
| `Applicant - Award directory.png` |
| `Applicant - Case Studies.png` |
| `Applicant - Case Studies - Details.png` |
| `Applicant - Compose message.png` |
| `Applicant - Dasboard - site visit - list view.png` |
| `Applicant - Dashboard- site visit - calender view.png` |
| `Applicant - Dashboard - Evalution Result.png` |
| `Applicant - Dashboard - My applications.png` |
| `Applicant - Dashboard - My applications-1.png` |
| `Applicant - Evaluation Result.png` |
| `Applicant - Messages.png` |
| `Applicant - Resources & Document - Award Categories.png` |

**Assessor**

| File |
|------|
| `Assessor - Dashboard.png` |
| `Assessor - Evaluation.png` |
| `Assessor - Evaluation History.png` |
| `Assessor - Evaluation - Park details.png` |
| `Assessor - Evaluation - Park details-1.png` |
| `Assessor - Evaluation - Park Application detail.png` |
| `Assessor - Manage Preference.png` |
| `Assessor - Marking Criteria.png` |
| `Assessor - Marking Criteria - Award details.png` |
| `Assessor - Schedule Visit.png` |

**Super Admin**

| File |
|------|
| `Super Admin - Dashboard.png` |
| `Super Admin - Assessor Management.png` |
| `Super Admin - Assessor Allocation - Application List.png` |
| `Super Admin - Coverage Map.png` |
| `Super Admin - Award management - Award category.png` |
| `Super Admin - Award Management - Recent Applications.png` |
| `Super Admin - Past Winners.png` |
| `Super Admin - Award Management - Shortlisted Parks.png` |
| `Super Admin - Award Management - Finalist Comparison.png` |
| `Super Admin - Park details.png` |
| `Super admin - Management - Category details.png` |
| `Super Admin - Award management - User role Management - Judges.png` |
| `Super Admin - Award management - User role Management - Judges-1.png` |
| `Super Admin - Document Archieve.png` |

**Shared / ambiguous role**

| File |
|------|
| `Message.png` |

---

## 1. Pages

| Node ID | Name   | Notes |
|---------|--------|--------|
| `0:1`   | Page 1 | Single canvas; all top-level frames live here. |

There are **no additional Figma pages** in this export — everything is one flat canvas with frames laid out spatially (desktop regions, admin strip, mobile strip, workshop area).

---

## 2. Top-level frame inventory (high level)

Roughly **95** immediate children of the canvas were returned by metadata. They fall into these **buckets** (by name, size, and position — not by pixel inspection):

| Bucket | Count (approx) | Typical size | Purpose |
|--------|------------------|--------------|---------|
| **A. Applicant — desktop app** | ~24 | 1280×832–2690 | Primary applicant flows |
| **B. Assessor — desktop** | ~10 | 1280×832–2782 | Assessor workspace |
| **C. Super Admin — desktop** | ~16 | 1280×936–2690 | Admin / awards / users |
| **D. Mobile (iPhone)** | ~11 | 390×844–1316 | Responsive or native-like mobile |
| **E. Workshop / components** | ~15 | mixed; many small or negative `x` | `Component *`, small `Frame *`, design exploration |
| **F. Fragments / chrome** | ~19 | narrow widths, odd heights | Table strips, notifications, modals, duplicate tab bars |

---

## 3. Screen families (grouped by role + pattern)

Families are **product groupings** inferred from frame names and dimensions. **Representative node** = suggested anchor for `get_design_context` or implementation.

### 3.1 Applicant — authenticated shell + dashboard

| Representative | Name | Size |
|----------------|------|------|
| **`3:2`** | Applicant - Dashboard - My applications | 1280×832 |

**Variants / duplicates (same pattern, different node):**

- `332:1647` — same title, alternate layout region (metadata duplicate family).
- Tab / sub-nav strips: `332:1750`, `339:1923`, `22:859` (part of dashboard — tab row “My application / Evaluation / Site visit”).

**Related dashboard / home:**

- `44:231` — Applicant - Applications  
- `214:3442` — Applicant - Dashboard - Evalution Result *(spelling in Figma)*  
- `215:3602` — Applicant - Evaluation Result (tall scroll — 1280×1997)

### 3.2 Applicant — multi-step application wizard (forms)

Sequential **1280px-wide** steps (same *family*: top app chrome + long form body):

| Order (logical) | Node ID | Name |
|-----------------|---------|------|
| 1 | `109:663` | Applicant - Application - Location |
| alt | `339:1895` | Applicant - Application - Location (variant) |
| 2 | `109:846` | Applicant - Application - Site Information |
| 3 | `110:1378` | Applicant - Application - contact details |
| 4 | `110:1579` | Applicant - Application - publicity |
| 5 | `110:1681` | Applicant - Application - Optional Information |
| 6 | `111:2036` | Applicant - Application - Document |
| 7 | `113:456` | Applicant - Application - Review & submit |
| done | `114:538` | Appicant - Application - Submitted *(spelling in Figma)* |

**Anchor for wizard:** `109:663` or `109:846` (first full step with shared chrome).

### 3.3 Applicant — resources, awards, content

| Node ID | Name |
|---------|------|
| `48:234` | Applicant - Resources & Document - Award Categories |
| `62:304` | Applicant - Award directory |
| `107:290` | Applicant - Award category - details |
| `79:633` | Applicant - Case Studies |

### 3.4 Applicant — messaging

| Node ID | Name |
|---------|------|
| `92:269` | Applicant - Messages |
| `100:597` | Applicant - Compose message |

### 3.5 Applicant — site visit

| Node ID | Name |
|---------|------|
| `26:893` | Applicant - Dasboard - site visit - list view *(spelling in Figma)* |
| `33:1287` | Applicant - Dashboard- site visit - calender view |

### 3.6 Assessor — desktop

| Node ID | Name |
|---------|------|
| **`122:731`** | Assessor - Dashboard |
| `128:498` | Assessor - Schedule Visit |
| `134:2089` | Assessor - Evaluation |
| `135:2512` | Assessor - Evaluation - Park details |
| `262:6219` | Assessor - Evaluation History |
| `147:1000` | Assessor - Marking Criteria |
| `150:1019` | Assessor - Marking Criteria - Award details |
| `157:1582` | Assessor - Manage Preference |
| `153:1438` | Message |

**Anchor:** `122:731` (dashboard), then `134:2089` (evaluation).

### 3.7 Super Admin — desktop

| Node ID | Name |
|---------|------|
| **`159:1850`** | Super Admin - Dashboard |
| `194:1028` | Super Admin - Assessor Management |
| `202:2045` | Super Admin - Assessor Allocation - Application List |
| `207:2777` | Super Admin - Coverage Map |
| `212:3068` | Super Admin - Award management - Award category |
| `227:4609` | Super Admin - Award Management - Recent Applications |
| `227:5093` | Super Admin - Past Winners |
| `228:5474` | Super Admin - Award Management - Shortlisted Parks |
| `230:5944` | Super Admin - Park details |
| `237:1160` | Super Admin - Award Management - Finalist Comparison |
| `238:1458` | Super admin - Management - Category details |
| `247:1172` | Super Admin - Award management - User role Management - Judges |
| `248:1711` | Super Admin - Award management - User role Management - Judges (variant) |
| `268:1471` | Super Admin - Document Archieve |

**Anchor:** `159:1850`.

### 3.8 Mobile — iPhone 13 & 14 (and named mobile flows)

| Node ID | Name |
|---------|------|
| `359:1913` | iPhone 13 & 14 - 1 |
| `362:2004` | iPhone 13 & 14 - 2 |
| `366:2169` | iPhone 13 & 14 - 3 |
| `371:1786` | iPhone 13 & 14 - 4 |
| `373:1944` | iPhone 13 & 14 - 5 |
| `385:1941` | iPhone 13 & 14 - 6 |
| `385:1998` | iPhone 13 & 14 - 7 |
| `385:2055` | iPhone 13 & 14 - 8 |
| `398:2612` | iPhone 13 & 14 - 9 |
| `390:2214` | Site Information - Continue Assessment |
| `393:2509` | Site Information -Complete assessment |

**Anchor:** `359:1913` (first in series).

### 3.9 Workshop / uncategorized top-level frames

Negative or scattered coordinates — likely **not** shippable routes without designer confirmation:

- `5:97`, `5:76`, `5:90`, `5:111`, `21:836` — `Component 1`, `Component 3`, small frames  
- `383:1819`, `383:1824` — very large `Frame 756` / `757` (possible overview)  
- Many `Frame ###` without role prefix — treat as **components or scraps** until triaged.

### 3.10 UI fragments (may map to shared components, not routes)

| Node ID | Name | Notes |
|---------|------|--------|
| `100:1026` | Notification | 520×960 — drawer / panel |
| `114:728`, `119:729`, `153:1436` | Frame 229 / 230 / 327 | 1418×147 — possible table header chrome |
| `209:3064`, `229:5923`, `262:6612` | Frame 518 / 519 / 646 | 1191×136 — repeated strip pattern |
| `141:3012` | Frame 326 | narrow column — possible sidebar module |

---

## 4. Repeating layout patterns (inferred)

| Pattern | Where it shows up | Implementation hint |
|---------|-------------------|----------------------|
| **App shell** | Most 1280-wide applicant/assessor/admin frames | Fixed top nav + optional secondary row + scrollable main |
| **Dashboard + KPI row + table** | `3:2`, similar admin dashboards | `StatCard` grid + `DataTable` + toolbar (search/filter) |
| **Pill / tab switcher** | Dashboard variants (`Component 3` / `Component 4` / `Component 5` instances in metadata) | Single `SegmentedControl` or tab component |
| **Multi-step form** | Application flow `109:*` → `113:456` | `WizardLayout` + `Stepper` + shared field primitives |
| **Long scroll detail** | `215:3602`, `135:2512`, `113:456` | Single column form / sections |
| **List + detail (assessor)** | Schedule → Evaluation → Park details | Shared list layout + detail panel pattern |
| **Admin dense tables** | Multiple super-admin 1280 frames | Filter bar + table + optional side drawer |
| **Mobile stack** | 390-wide frames | Separate layout grid; do not stretch desktop shell |

---

## 5. Component library hints (from structure, not Figma Components API)

Formal **component frames** visible at top level include names like `Component 1`, `Component 3`, `Component 12`, `Component 17`, plus many **instances** inside screens (e.g. `instance` nodes in XML).

**Likely primitive categories:**

- Typography scales (Inter weights/sizes — confirm in Phase 2 tokens)
- Color: neutrals, accent green, status pills
- `Button`, `IconButton`, `TextField`, `SearchField`, `FilterButton`
- `Card`, `StatCard`, `StatusPill`, `Link`
- `AppHeader`, `UserMenu`, `NavLink`, `Table`, `TableRow`, `EmptyState`
- `WizardChrome`, `FormSection`, `FileUpload` (for application steps)

**Composite categories:**

- Applicant shell  
- Assessor shell  
- Super Admin shell (may differ nav density)  
- Message composer module  
- Map / coverage module (admin)

---

## 6. Ambiguities & follow-ups (running list)

1. **Duplicate frames** with the same title (e.g. two “Applicant - Dashboard - My applications”) — confirm which is canonical for dev mode.  
2. **Typos in frame names** (“Evalution”, “Dasboard”, “Appicant”, “Archieve”) — use Figma as source of truth for *design*; use correct spelling in *code* unless product says otherwise.  
3. **Scope:** Implement **desktop 1280 first**, then mobile 390, or parallel? — product decision.  
4. **Workshop frames** (negative coordinates, huge `Frame 756`) — exclude from routing until confirmed.  
5. **Tokens:** This manifest has **no colors or type values** — Phase 2 must pull tokens via `get_design_context`, variables (if selection works), or REST file JSON.

---

## 7. Suggested anchor screens (for Phase 4)

| Family | Anchor node ID | Frame name |
|--------|----------------|------------|
| Applicant dashboard | `3:2` | Applicant - Dashboard - My applications |
| Applicant wizard | `109:846` | Applicant - Application - Site Information |
| Applicant messages | `92:269` | Applicant - Messages |
| Assessor | `122:731` | Assessor - Dashboard |
| Super Admin | `159:1850` | Super Admin - Dashboard |
| Mobile | `359:1913` | iPhone 13 & 14 - 1 |

---

*End of Phase 1 manifest. Next artifact (when you ask): `docs/figma-build-plan.md`.*
