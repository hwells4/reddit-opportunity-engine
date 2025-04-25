## Clerk-Inspired UI Style Guide (Based on Screenshot)

This document outlines the specific visual style observed in the provided screenshot, aiming to replicate its look and feel within the `shadcn/ui` and Tailwind v4 framework. It builds upon the general design principles already established.

### 1. Core Principles Recap (from general guidelines)

*   **Typography**: Strictly adhere to 4 font sizes and 2 weights (Semibold, Regular).
*   **Spacing**: Use the 8pt grid system (all spacing values divisible by 8 or 4).
*   **Color**: Follow the 60/30/10 rule (Neutral, Complementary, Accent).

### 2. Color Palette

*   **Neutral (60%)**: `oklch(1 0 0)` (White) - Used for main backgrounds, card backgrounds, input backgrounds, social button backgrounds. Corresponds to `--background`.
*   **Complementary (30%)**:
    *   `oklch(0.145 0 0)` (Near Black) - Used for primary text (headings), borders, shadows, icons. Corresponds to `--foreground` and `--border`.
    *   `oklch(0.45 0 0)` (Medium Gray) - Used for secondary text (subtitles, labels like "Email address"), dividers. Corresponds to `--muted-foreground`.
*   **Accent (10%)**: `oklch(0.60 0.22 15)` (Red) - Used for the primary action button background, link text ("Use phone", "Sign up"). Corresponds to `--primary`.
*   **Accent Foreground**: `oklch(0.985 0 0)` (Near White) - Used for text on the primary action button. Corresponds to `--primary-foreground`.

*(Note: OKLCH values are approximate based on visual inspection and standard mappings. Ensure `--input` also maps to the Near Black color for borders.)*

### 3. Typography

*   **Font**: Default sans-serif font provided by `shadcn/ui` (likely Inter).
*   **Sizes & Weights**:
    *   **Size 1 (Heading)**: e.g., `text-2xl font-semibold`
    *   **Size 2 (Subheading)**: e.g., `text-sm text-muted-foreground`
    *   **Size 3 (Body/Button)**: e.g., `text-base font-semibold`
    *   **Size 4 (Small/Labels/Links)**: e.g., `text-sm font-regular` (labels), `text-sm font-semibold` (links)

### 4. Borders and Shadows (Key Style Element)

*   **Distinctive Style**: Interactive elements (Buttons, Inputs) feature a **thick (2px) solid black border** combined with a **solid black offset shadow** (4px offset below and right).
*   **Implementation**: Use `border-2 border-foreground shadow-[4px_4px_0px_0px_theme(colors.foreground)]`. Define a utility if needed.
*   **Non-Interactive Elements**: No border/shadow. Dividers are simple lines (`border-t`).

### 5. Spacing (8pt Grid)

*   **Consistency**: Use Tailwind utilities divisible by 4 or 8 (e.g., `p-4`, `m-6`, `gap-2`).
*   **Reference Values**: See screenshot analysis for estimated values (padding, margins, gaps).

### 6. Component Styles

*   **Buttons**:
    *   **Primary (`variant="default"`)**: `bg-primary`, `text-primary-foreground`, Semibold, border/shadow style.
    *   **Social Login (`variant="outline" or custom`)**: `bg-background`, Icon only, border/shadow style.
    *   **Link (`variant="link"`)**: `text-primary`, Semibold, underline on hover. No border/shadow.
*   **Input Fields (`Input` component)**: `bg-background`, `text-foreground`, border/shadow style.
*   **Labels (`Label` component)**: `text-muted-foreground`, Size 4, Regular weight.
*   **Dividers**: `border-t`, with centered text using flexbox/grid layout.

### 7. Layout

*   **Card Component**: White background, internal padding (e.g., `p-6` or `p-8`), no border/shadow on the card itself.
*   **Centering**: Use standard layout techniques (flex, grid, margin auto) for centering.
*   **Footer**: Section for secondary links/branding, potentially using `mt-auto`.

### 8. Animation & Interaction

*   **Hover/Focus**: Subtle transitions (e.g., `transition-transform duration-150 hover:-translate-y-px active:translate-y-0`).
*   **Focus Ring**: Ensure focus states are visible and complement the style (e.g., `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`). 