

## Template Preview Quality Upgrade

### Problem Summary
Two issues found:

1. **SecureHealth** has 2 two-column blocks using old data format (title embedded in rich text `content` instead of dedicated `eyebrow`/`title` fields)
2. **Preview CSS isolation** is broken -- templates with different design systems (Momentum dark theme, Service Pro colors) render incorrectly because CSS variables and the `dark` class leak into/from the admin context

### Plan

#### Task 1: Upgrade SecureHealth two-column blocks

Migrate 2 blocks in `src/data/templates/securehealth.ts`:

- **Services page** (line 85): Extract "Primary Care" heading to `title` field, add `eyebrow: 'SERVICES'`
- **About page** (line 98): Extract "Our Story" heading to `title` field, add `eyebrow: 'OUR PRACTICE'`

Remove the `heading` nodes from the `content` field in both cases.

#### Task 2: Fix FlowWink Platform old-format two-column

Line 1165 uses `leftColumn`/`rightColumn` format which is a different block variant. Verify this renders correctly -- if not, migrate to standard `content` + `eyebrow`/`title` format.

#### Task 3: Improve preview CSS isolation

The current preview applies CSS variables as inline styles and adds a `dark` class, but this is insufficient:

**Current problem:**
- Dark-themed templates (Momentum) don't get proper dark-mode styling because the `dark` class on a div doesn't cascade to Tailwind's `dark:` variants properly (Tailwind looks for `dark` class on the root element by default)
- CSS variables like `--primary`, `--background`, `--foreground` are set but don't override the admin theme properly
- Hero video backgrounds, parallax sections, and full-width blocks render oddly inside the constrained preview container

**Solution: Scoped CSS isolation in TemplatePreview.tsx**

1. Add a `<style>` tag scoped to `.template-preview-content` that overrides all necessary CSS custom properties from the template's branding
2. Force `color-scheme` and `background-color`/`color` on the preview container based on the template theme
3. Add `isolation: isolate` and `contain: content` CSS properties to prevent style leakage
4. For dark templates, set explicit background/foreground colors on the container rather than relying on Tailwind's `dark:` class strategy
5. Apply the template's font families (headingFont, bodyFont) directly on the preview container

**Key changes to `TemplatePreview.tsx`:**
- Inject a scoped `<style>` block that maps all template branding values to CSS custom properties within `.template-preview-content`
- Set `backgroundColor` and `color` explicitly based on `isDarkTheme`
- Add `overflow: hidden` to prevent full-viewport hero blocks from breaking the layout

This approach keeps the live component rendering (no screenshots needed) while properly isolating the template's visual identity from the admin shell.

#### Task 4: Run template validation tests

Verify all 9 templates still pass validation after data changes.

### Files to modify
- `src/data/templates/securehealth.ts` -- migrate 2 two-column blocks
- `src/components/admin/templates/TemplatePreview.tsx` -- improve CSS isolation with scoped styles
- `src/data/templates/flowwink-platform.ts` -- verify/fix old-format two-column (if needed)

