# UI Redesign — Navigation & Visual Polish

## Summary

Replace sidebar navigation with a top bar. Update colour scheme to indigo/violet. Center all content.

## Navigation Structure

**Top bar (single row, ~44px):**
- Left: logo `kotoba` (bold, `em` accent in indigo)
- Middle: language tabs — one tab per language, active tab underlined in indigo. `+` to add a new language.
- Right: icon buttons — Home (`⊞`), Practice (`💪`), Progress (`📈`), History (`🕐`), Settings (`⚙`) — active icon highlighted with indigo bg. Divider, then theme toggle.

**Section tabs row (second row, shown only on `/languages/[id]/*`):**
- `Rules` | `Vocabulary` — underline style, same as language tabs.

**No sidebar.** Remove `SidebarProvider`, `AppSidebar`, `SidebarInset`, `SidebarTrigger` from layout.

## Colour Scheme

Update CSS variables to indigo/violet palette:
- `--primary`: indigo `oklch(0.5850 0.2380 264)` (~#6366f1)
- `--ring`: slightly lighter indigo
- `--accent` / `--accent-foreground`: indigo tints
- `--sidebar-*` variables: remove or remap to `--background`/`--foreground`

Dark mode ambient glow: subtle `radial-gradient` in indigo behind content (via `::before` on content wrapper).

## Content Layout

Every page: `max-w-2xl mx-auto w-full px-6 py-6`. Remove per-page `max-w-2xl` wrappers where layout handles it.

## Components Changed

| File | Change |
|------|--------|
| `app/globals.css` | Update colour vars to indigo palette |
| `app/(dashboard)/layout.tsx` | Replace sidebar layout with TopNav + content |
| `app/(dashboard)/_components/Sidebar.tsx` | Replace with `TopNav.tsx` |
| `app/(dashboard)/_components/ThemeToggle.tsx` | Move into TopNav |

## Out of Scope

- Individual page content/logic
- Auth pages
- Mobile breakpoints (keep existing behaviour)