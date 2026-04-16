# Design System Specification: The Kinetic Console

## 1. Overview & Creative North Star
### The Creative North Star: "The Precision Instrument"
This design system moves away from the generic "SaaS Dashboard" and into the realm of high-performance technical tools. It is inspired by the tactical efficiency of a pilot's cockpit and the structured density of a premium IDE.

While the user requested "clean borders," we are elevating this to **Tactile Layering**. Instead of relying on heavy strokes that clutter the view, we use tonal shifts and "Ghost Borders" to maintain a high-information density that feels breathable. We break the "template" look through **intentional asymmetry**: sidebar widths are minimized to the pixel, and data-heavy main views use a rigorous 4px baseline grid to ensure mathematical harmony.

## 2. Colors & Surface Architecture
The palette is rooted in `background: #111316`, a deep charcoal that reduces eye strain during long sessions.

### The "No-Line" Rule
Traditional 1px solid borders are prohibited for layout sectioning. They create visual noise in high-density environments. Instead, define boundaries through:
- **Background Shifts:** Place a `surface_container_low` section directly against the `surface` background.
- **Tonal Transitions:** Use the `surface_container` tiers to denote hierarchy.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of machined plates.
- **Base Level:** `surface` (#111316) – The desk.
- **Section Level:** `surface_container_low` (#1a1c1f) – Inset utility panels.
- **Active Level:** `surface_container_high` (#282a2d) – Active workspace or focused cards.
- **Floating Level:** `surface_bright` (#37393d) – Context menus and modals.

### The "Glass & Gradient" Rule
To keep the "Developer Console" from feeling flat or dated:
- **Glassmorphism:** For floating overlays (Command Palettes, Tooltips), use `surface_container_highest` at 80% opacity with a `20px` backdrop-blur.
- **Signature Accents:** Use a subtle linear gradient for primary actions: `primary` (#45d8ed) to `primary_container` (#009fb1) at a 135° angle.

## 3. Typography: Technical Authority
We employ a dual-type strategy that balances editorial clarity with technical precision.

- **Display & Headlines (Space Grotesk):** This font’s geometric quirks provide the "Editorial" feel. Use `headline-sm` for section headers to give the tool a bespoke, branded personality.
- **Technical Data & Body (Inter / Mono):** Use `SF Mono` or `JetBrains Mono` for all dynamic data, terminal outputs, and status values.
- **The Contrast Ratio:** Headlines should use `on_surface` (#e2e2e6), while secondary metadata should drop to `on_surface_variant` (#bcc9c6) to create a clear "read-first" path.

## 4. Elevation & Depth
Depth is a functional tool, not a stylistic choice.

- **Tonal Layering:** Avoid shadows for static elements. A `surface_container_lowest` card sitting on a `surface_container_low` background creates a "hollowed-out" effect that feels integrated into the machine.
- **Ambient Shadows:** For floating elements, use a "Tonal Shadow": `0px 8px 32px rgba(0, 0, 0, 0.4)`. Never use pure black shadows; always blend them with the surface color.
- **The "Ghost Border" Fallback:** Where separation is critical (e.g., input fields), use `outline_variant` (#3d4947) at **20% opacity**. It should be felt, not seen.

## 5. Components

### Buttons & Interaction
- **Primary:** Gradient fill (`primary` to `primary_container`). `0.25rem` (4px) corner radius. No border.
- **Secondary/Ghost:** `outline` stroke at 20% opacity. On hover, transition to `surface_container_highest` with 100% opacity.
- **States:** Hover states should be "Active": a subtle `0.5px` shift in Y-position or a slight increase in the `surface_tint` overlay.

### High-Density Cards & Lists
- **The Anti-Divider Rule:** Forbid `<hr>` or border-bottom separators.
- **Spacing as Separator:** Use 12px or 16px of vertical whitespace. If separation is needed, use a alternating background color (`surface_container_low` vs `surface_container_lowest`) for row striping.
- **Status Indicators:** Use `primary` for "active/installed" and `tertiary_container` for "pending." Indicators should be small (`8px`) pips or `label-sm` chips with a 10% opacity background of the status color.

### Technical Inputs
- **Monospace Input:** All text entries must use `JetBrains Mono` to ensure character alignment (crucial for keys, paths, and code).
- **Focus State:** 0px shadow, but a `1px` solid `primary` border. The glow should be internal (inner shadow) to keep the layout from shifting.

### Command Palette (Special Component)
A central floating component using **Glassmorphism**.
- Background: `surface_container_highest` @ 85%.
- Blur: `12px`.
- Border: `Ghost Border` (outline-variant @ 30%).

## 6. Do’s and Don’ts

### Do:
- **Do** embrace "Information Density." It is okay to have 50+ data points on screen if they are aligned to the 4px grid.
- **Do** use `primary_fixed_dim` for icons to give them a "lit" appearance against dark backgrounds.
- **Do** use `0.25rem` (4px) rounding for almost everything to maintain a "precise" feel.

### Don’t:
- **Don’t** use large border radii (xl/full) except for status pips. Large rounds feel "consumer-soft" rather than "pro-utility."
- **Don’t** use pure white (#FFFFFF). It breaks the dark-mode immersion. Use `on_surface`.
- **Don’t** use 100% opaque borders. They create "grid-lock" visual fatigue.
