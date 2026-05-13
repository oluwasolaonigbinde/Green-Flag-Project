# Design-to-Code Instructions for Cursor

## What's In This Folder

- **design-tokens.json** — Every color, font, spacing value, border radius,
  and shadow used in the design. USE THESE EXACT VALUES. Do not approximate.

- **components.json** — The reusable components the designer defined.
  Build these first as your component library.

- **named-styles.json** — Named styles from Figma (color styles, text styles, etc.)

- **screens/** — One JSON file per page. Each contains the full node tree for
  every screen on that page, with exact properties for every element.

- **screenshots/** — Visual reference PNGs of every screen at 2x resolution.
  Use these to verify your output matches the design visually.

- **screenshot-manifest.json** — Maps screenshot files to screen names and IDs.

## Build Order

### Phase 1: Design Tokens
Read design-tokens.json and create your CSS variables / theme config.
Every color, font size, spacing value, and border radius should come
from this file. Do not invent values.

### Phase 2: Component Library
Read components.json → nodes section. Build each component.
Cross-reference with design-tokens.json for exact values.
Cross-reference with screenshots/ for visual verification.

### Phase 3: Screen Assembly
For each screen in screens/:
1. Read the screen JSON (the "tree" field has the full node hierarchy)
2. Look at the corresponding screenshot for visual reference
3. Build the screen using the components from Phase 2
4. For elements that are INSTANCE type, check componentId to find
   which component to use

## Key Concepts

- **INSTANCE nodes** reference a componentId → look it up in components.json
- **layout.mode = "HORIZONTAL"** → display: flex; flex-direction: row
- **layout.mode = "VERTICAL"** → display: flex; flex-direction: column
- **layout.primaryAxisAlignItems** → justify-content mapping
- **layout.counterAxisAlignItems** → align-items mapping
- **layoutGrow = 1** → flex: 1
- **layoutAlign = "STRETCH"** → align-self: stretch
- **fills** → background colors/gradients
- **strokes** → borders
- **effects** with type "DROP_SHADOW" → box-shadow
- **effects** with type "INNER_SHADOW" → box-shadow inset
- **effects** with type "LAYER_BLUR" → filter: blur()
- **textStyle** → all font properties
- **bounds.width / bounds.height** → element dimensions
- **cornerRadius** → border-radius

## Screens Found

  - [Page 1] Applicant - Dashboard - My applications
  - [Page 1] Applicant - Dashboard - My applications
  - [Page 1] Frame 41
  - [Page 1] oui:nav-security-cases
  - [Page 1] si:dashboard-line
  - [Page 1] Applicant - Dashboard - Evalution Result
  - [Page 1] Applicant - Evaluation Result
  - [Page 1] Applicant - Application - Location
  - [Page 1] Applicant - Mystery Shopping
  - [Page 1] Group Award - Aplication _ Location
  - [Page 1] Frame 914
  - [Page 1] Frame 949
  - [Page 1] Applicant - Application - Location
  - [Page 1] Frame 41
  - [Page 1] Applicant - Application - Site Information
  - [Page 1] Applicant - Application - contact details
  - [Page 1] Applicant - Application - publicity
  - [Page 1] Applicant - Application - Optional Information
  - [Page 1] Applicant - Application - Document
  - [Page 1] Applicant - Application - Green Heritage Accreditaion
  - [Page 1] Applicant - Application - Review & submit
  - [Page 1] Super Admin - Park details
  - [Page 1] Super Admin - Park details
  - [Page 1] Super Admin - Park details
  - [Page 1] Appicant - Application - Submitted 
  - [Page 1] Appicant - Application - Submitted 
  - [Page 1] Appicant - Application - Payment 
  - [Page 1] Applicant  - Applications
  - [Page 1] Applicant - Resources & Document - Award Categories
  - [Page 1] Applicant - Award category - details
  - [Page 1] Applicant - Award category - details
  - [Page 1] Applicant - Award category - details
  - [Page 1] Applicant - Award category - details
  - [Page 1] Applicant - Award category - details
  - [Page 1] Assessor - Marking Criteria
  - [Page 1] Assessor - Marking Criteria - Award details
  - [Page 1] Applicant - Award directory
  - [Page 1] Applicant - Case Studies
  - [Page 1] Applicant - Case Studies - Details
  - [Page 1] Applicant - Messages
  - [Page 1] Applicant - Compose message
  - [Page 1] Message
  - [Page 1] Applicant - Dasboard - site visit - list view
  - [Page 1] Applicant - Dashboard- site visit - calender view
  - [Page 1] Frame 17
  - [Page 1] Frame 16
  - [Page 1] Component 1
  - [Page 1] Frame 20
  - [Page 1] Component 3
  - [Page 1] tdesign:no-result
  - [Page 1] solar:calendar-linear
  - [Page 1] mynaui:location
  - [Page 1] fluent:people-team-24-regular
  - [Page 1] Frame 83
  - [Page 1] Frame 119
  - [Page 1] Frame 155
  - [Page 1] Frame 157
  - [Page 1] Notification
  - [Page 1] Frame 229
  - [Page 1] Frame 230
  - [Page 1] Frame 327
  - [Page 1] Assessor - Dashboard
  - [Page 1] Super Admin - Dashboard
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Assessor Management
  - [Page 1] Super Admin - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Frame 962
  - [Page 1] Frame 971
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Frame 970
  - [Page 1] Frame 972
  - [Page 1] Frame 501
  - [Page 1] Frame 502
  - [Page 1] Frame 503
  - [Page 1] Frame 504
  - [Page 1] Frame 505
  - [Page 1] Frame 506
  - [Page 1] Frame 507
  - [Page 1] Frame 508
  - [Page 1] Frame 962
  - [Page 1] Super Admin - Coverage Map
  - [Page 1] Super Admin - Award management - Award category
  - [Page 1] Super Admin - Award Management - Recent Applications
  - [Page 1] Super Admin - Past Winners
  - [Page 1] Super Admin - Award Management - Finalist Comparison
  - [Page 1] Super Admin - Award management - User role Management - Judges
  - [Page 1] Super Admin - Award management - User role Management - Judges
  - [Page 1] Super Admin - Award management - User role Management - Judges
  - [Page 1] Super Admin - Document Archieve
  - [Page 1] Frame 36
  - [Page 1] Frame 645
  - [Page 1] Super admin - Management - Category details
  - [Page 1] Super Admin - Award Management - Shortlisted Parks 
  - [Page 1] Frame 518
  - [Page 1] Frame 519
  - [Page 1] Assessor - Manage Preference
  - [Page 1] Frame 245
  - [Page 1] Assessor - Schedule Visit
  - [Page 1] Assessor - Evaluation
  - [Page 1] Assessor - Evaluation History
  - [Page 1] Assessor - Evaluation - Park details
  - [Page 1] Assessor - Evaluation - Park details
  - [Page 1] Assessor - Evaluation - Park Application detail
  - [Page 1] Assessor - Evaluation - Park Application detail
  - [Page 1] Frame 353
  - [Page 1] Frame 464
  - [Page 1] Frame 467
  - [Page 1] Frame 465
  - [Page 1] Frame 466
  - [Page 1] Frame 477
  - [Page 1] Frame 504
  - [Page 1] Frame 644
  - [Page 1] Frame 647
  - [Page 1] Frame 646
  - [Page 1] Component 12
  - [Page 1] fluent:form-28-regular
  - [Page 1] proicons:document
  - [Page 1] fluent-mdl2:company-directory-mirrored
  - [Page 1] pixelarticons:tool-case-sharp
  - [Page 1] Frame 211
  - [Page 1] iPhone 13 & 14 - 1
  - [Page 1] iPhone 13 & 14 - 2
  - [Page 1] iPhone 13 & 14 - 9
  - [Page 1] iPhone 13 & 14 - 3
  - [Page 1] iPhone 13 & 14 - 10
  - [Page 1] Site Information - Continue Assessment
  - [Page 1] Site Information -Complete assessment
  - [Page 1] iPhone 13 & 14 - 4
  - [Page 1] iPhone 13 & 14 - 6
  - [Page 1] iPhone 13 & 14 - 7
  - [Page 1] iPhone 13 & 14 - 8
  - [Page 1] Frame 764
  - [Page 1] iPhone 13 & 14 - 5
  - [Page 1] Component 17
  - [Page 1] Frame 756
  - [Page 1] Frame 757
  - [Page 1] Frame 765
  - [Page 1] Component 18
  - [Page 1] Frame 781
  - [Page 1] document upload
  - [Page 1] Applicant - Application - Application details
  - [Page 1] Applicant - Application - Application details - Mystery Shopping
  - [Page 1] Frame 948
  - [Page 1] Default marker component
  - [Page 1] Confirm Allocation 
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Super Admin - Live Result
  - [Page 1] Super Admin - Assessor Allocation - Application List
  - [Page 1] Default marker component
  - [Rough sketch] MacBook Air - 2
  - [📄 Document Assets] Notely: Component which controls all notes
  - [📄 Document Assets] Notely — Support & Premium

## Components Found

  - iconamoon:notification-light
  - Property 1=Frame 45
  - Property 1=Frame 43
  - Property 1=Frame 675
  - si:dashboard-line
  - Property 1=Frame 674
  - fluent:form-28-regular
  - oui:nav-security-cases
  - proicons:document
  - fluent-mdl2:company-directory-mirrored
  - pixelarticons:tool-case-sharp
  - Property 1=Frame 44
  - Property 1=On click
  - Property 1=input
  - Property 1=Hovering
  - Property 1=Default
  - Property 1=drop down
  - Chevron down
  - Selected=True, State=Enabled
  - radio_button_checked
  - State=Default, Value Type=Unchecked
  - Check
  - Property 1=Default
  - Property 1=Upload Document
  - Property 1=Default
  - State=Default, Value Type=Checked
  - File text
  - Frame 1
  - Month
  - icon/back
  - icon/forward
  - Days of Week
  - Day
  - Week
  - Block/0
  - Date/DifferentMonth
  - Block/1
  - Event
  - Date/NotToday
  - Block/2
  - Block/4+
  - Date/Today
  - Property 1=Default
  - tdesign:no-result
  - solar:calendar-linear
  - mynaui:location
  - fluent:people-team-24-regular
  - Pagination
  - State=Disabled
  - Arrow left
  - Pagination List
  - State=Current
  - State=Default
  - Pagination Gap
  - State=Default
  - Arrow right
  - Selected=False, State=Enabled
  - radio_button_unchecked
  - ant-design:more-outlined
  - Type=Year, weekend=false, Quantity=none, Month View=true
  - date=true, day=false, selected=false, hover=false
  - Type=small, Bold=false
  - small calendar
  - date=false, day=true, selected=false, hover=false
  - date=true, day=false, selected=true, hover=false
  - Color=Yellow
  - Property 1=Error
  - Background=True
  - Property 1=Frame 694
  - Type=Unselected, State=Enabled
  - Type=Selected, State=Enabled
  - check_small
  - Property 1=Frame 695
  - Property 1=Successful
  - Property 1=Unsuccessful
  - Property 1=failed
  - Default marker component
  - State=On
  - State=Off
  - Default marker component
  - Color=Red
  - Color=Green
  - Color=Blue
  - Color=Purple
  - Color=Black
  - Color=White
  - Color=Rainbow

## Important Rules

1. Use EXACT values from design-tokens.json. Never approximate colors or spacing.
2. Build components FIRST, then assemble screens.
3. Every INSTANCE node means "use the component" — don't rebuild it inline.
4. When in doubt, check the screenshot. The JSON gives precision; the image gives intent.
5. Auto-layout frames map directly to CSS flexbox. Use the layout properties.
