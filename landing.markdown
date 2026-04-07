# Design System: Verdant Precision

### 1. Overview & Creative North Star
**Creative North Star: "The Regenerative Ledger"**

Verdant Precision is a design system that bridges the gap between high-tech agricultural data and the tactile nature of farming. It moves away from the cold, industrial feel of traditional ERPs toward a "High-End Editorial" experience. By utilizing intentional asymmetry, expansive whitespace, and a high-contrast typographic scale, the system creates a sense of clarity and modern stewardship. 

The layout is characterized by "breathing room"—generous gutters and margins that allow complex data like crop milestones and contract details to be digested without cognitive overload. It rejects the crowded "dashboard" aesthetic in favor of a curated feed that feels as much like a premium financial journal as it does a utility tool.

### 2. Colors
The palette is rooted in a spectrum of greens, ranging from the neon vitality of `#4cdf20` (Seed Primary) to the deep, silty tones of the neutral scale.

- **The "No-Line" Rule:** Visual sectioning must be achieved through background shifts rather than 1px borders. For example, a milestone card is distinguished from the page background by moving from `surface` (`#f6f8f6`) to `surface_container_low` (`#f9fbf8`).
- **Surface Hierarchy & Nesting:** 
  - **Level 0 (Base):** `surface` for the overall page body.
  - **Level 1 (Card):** `surface_container_low` for primary content modules.
  - **Level 2 (In-Card Elements):** `surface_container` for secondary inputs or internal grouping.
- **The "Glass & Gradient" Rule:** Use `primary/20` (20% opacity) for chip backgrounds and interactive states to create a soft, luminous effect that mimics light through a greenhouse pane.
- **Signature Textures:** Interactive progress bars and primary indicators should use the vibrant `primary` green to command attention against the muted, organic background tones.

### 3. Typography
Verdant Precision utilizes **Manrope** across all roles to ensure a geometric yet friendly technical feel.

- **Display & Headlines:** Using a bold weight and tight tracking (`-0.033em` for large headers), headlines create a strong vertical anchor for the page. 
- **Typography Scale (Extracted Ground Truth):**
  - **Display (XL):** `2.25rem` (36px) — Used for primary page titles like "Soybean Milestones".
  - **Headline (L):** `1.5rem` (24px) — Used for section headers.
  - **Title (M):** `1.125rem` (18px) — Used for component headers within cards.
  - **Body (Default):** `1rem` (16px) — Standard reading text.
  - **Label/Caption:** `0.875rem` (14px) and `0.75rem` (12px) — For metadata, status tags, and helper text.
- **Rhythm:** The system prioritizes a dramatic jump between the 36px page title and the 16px body text to create an editorial hierarchy that emphasizes the subject matter over the interface.

### 4. Elevation & Depth
Elevation is achieved through **Tonal Layering** rather than shadows, emphasizing a flat, modern architectural aesthetic.

- **The Layering Principle:** Depth is conveyed by stacking colors. A milestone card sits "above" the background by being slightly lighter or darker, not by casting a shadow.
- **Ambient Shadows:** Where depth is critical (e.g., floating action buttons), use extra-diffused shadows with very low opacity (e.g., `0 10px 15px -3px rgba(0, 0, 0, 0.05)`).
- **The "Ghost Border":** If distinction is lost between two surfaces, use `outline_variant` at 50% opacity to provide a faint "ghost" edge.
- **Glassmorphism:** Navigation bars and filter chips use semi-transparent fills (e.g., `primary/20`) with backdrop blurs to maintain a sense of environmental continuity.

### 5. Components
- **Buttons & Chips:** Use `rounded-lg` (0.5rem) or `rounded-full` for a friendly, approachable feel. Primary buttons use the high-contrast `primary` green with `on_primary` (dark green/black) text for maximum legibility.
- **Milestone Cards:** Large containers with `p-4` padding, using background shifts to indicate state (e.g., a subtle neutral-100 fill).
- **Status Indicators:** Small, pill-shaped tags with a dot icon (e.g., `Verified`, `Pending`). Use semantic colors (Green, Yellow, Red) but at low saturation to keep the editorial tone intact.
- **Progress Bars:** Utilize a `rounded-full` track in `neutral-300` with a vibrant `primary` fill to visualize completion at a glance.
- **Input Fields/Selects:** Subtly recessed styles using `surface_container` backgrounds and `outline_variant` borders for a integrated, "built-in" look.

### 6. Do's and Don'ts
**Do:**
- Use generous whitespace (at least 24px between major sections).
- Mix `font-black` headings with `font-normal` body text for high contrast.
- Use iconography sparingly as a functional anchor (size 12 for cards, size 6 for logos).

**Don't:**
- Don't use heavy drop shadows or 3D effects.
- Don't use pure black for text; use `neutral-800` (`#111b0e`) to maintain the organic, botanical feel.
- Don't use sharp corners (0px); stick to `0.5rem` or `full` to reflect organic shapes.
- Don't crowd more than 5-6 items in a single vertical list without a "Show More" break.