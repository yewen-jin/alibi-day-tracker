# alibi design system

Single source of truth: `app/globals.css` + Tailwind v4 theme. Do not introduce inline `style={}` objects for colors, surfaces, or shadows — always use the named classes below.

---

## design rules

### no glass
Do **not** use `backdrop-blur`, semi-transparent backgrounds (`bg-white/75`, `bg-white/80`), or any `backdrop-filter`. All surfaces are solid white (`bg-white`) against the colorful page gradient.

### border: always 1px
Always `border` (1px). Never `border-2`. Opacity adjusts visual weight:
- `border-alibi-blue/12` — cards
- `border-alibi-blue/15` — elevated cards
- `border-alibi-lavender/40` — inputs and secondary buttons
- `border-alibi-lavender/20` — block items

### border radius scale

| Value | Size | Use |
|---|---|---|
| `rounded-2xl` | 16px | **Everything flat**: cards, panels, buttons, inputs, banners, block items, dropdowns — one value for all surfaces |
| `rounded-xl` | 12px | Sidebar nav link hover highlights only |
| `rounded-full` | pill | Nav pill bar, chips, icon buttons, color dots |

No `rounded-3xl`. No `rounded-[Xpx]` custom values.

### shadow system (lift + press + concave)

Depth is created through layered shadows, not glass blur:

| Effect | Use | Pattern |
|---|---|---|
| **Lift** | Cards, nav | `shadow-[0_1px_3px_rgba(50,83,199,0.06),0_6px_20px_rgba(50,83,199,0.09)]` |
| **Pop** | Primary focus card | `shadow-[0_2px_6px_rgba(50,83,199,0.08),0_12px_32px_rgba(50,83,199,0.12)]` |
| **Press** | Inset/recessed areas | `shadow-[inset_0_2px_6px_rgba(50,83,199,0.08)]` |
| **Input** | Form inputs | `shadow-[inset_0_1px_3px_rgba(50,83,199,0.07)]` |
| **Concave** | Block items, doc cards, calendar cells, nav link hover | `shadow-[0_1px_2px_rgba(50,83,199,0.05),inset_0_2px_5px_rgba(50,83,199,0.08)]` |
| **Button** | Filled buttons | `shadow-[0_2px_6px_{color},0_4px_14px_{color}]` — handled by button classes |

Use Lift + Press together to create a "card floating above a recessed area" reading. Concave creates a pressed-in inner tile feel — used on block items, doc cards, calendar day cells, and nav link hover states.

---

## color tokens

Defined in `app/globals.css` under `:root` and `@theme inline`.

| Token | Hex | Use |
|---|---|---|
| `alibi-ink` | `#162044` | Primary text, body |
| `alibi-blue` | `#3253C7` | Brand primary, headings, active states |
| `alibi-pink` | `#BF7DAD` | Accent, stop actions, hover state |
| `alibi-teal` | `#43849D` | Secondary text, labels, muted foreground |
| `alibi-lavender` | `#93A5E4` | Borders, chips, tints, chart fills |

**Semantic usage:**
- Page h1: `text-alibi-blue font-black`
- Section labels: `text-alibi-teal font-black uppercase tracking-[0.12em]`
- Muted text: `text-alibi-teal` or `text-alibi-teal/60`
- Borders: `border-alibi-blue/12` (cards) · `border-alibi-lavender/40` (inputs/buttons)
- Hover accents: `hover:text-alibi-pink` · `hover:border-alibi-pink`

> Chart and data-viz components may use hex literals in inline `style` props for dynamic computed values (e.g. calendar density). Same palette — no new colors. Calendar day cells use the **Concave** shadow pattern via inline `boxShadow` (since background and border are also dynamic): `0 1px 2px rgba(50,83,199,0.05), inset 0 2px 5px rgba(50,83,199,0.08)`.

---

## surface components

All defined in `app/globals.css` under `@layer components`.

### `.alibi-card`
Main panel. Cards, sections, feature tiles, info panels, sidebars.
```
rounded-2xl border border-alibi-blue/12 bg-white
shadow-[0_1px_3px_rgba(50,83,199,0.06),0_6px_20px_rgba(50,83,199,0.09)]
```

### `.alibi-card-pop`
Elevated card. The primary focus element on a page (timer card, hero).
```
rounded-2xl border border-alibi-blue/15 bg-white
shadow-[0_2px_6px_rgba(50,83,199,0.08),0_12px_32px_rgba(50,83,199,0.12)]
```

### `.alibi-pill`
Full-radius surface. Navigation bars only.
```
rounded-full border border-alibi-blue/12 bg-white
shadow-[0_1px_3px_rgba(50,83,199,0.06),0_6px_20px_rgba(50,83,199,0.09)]
```

### `.alibi-inset`
Recessed surface. Chat message areas, quoted panels — anything that sits inside a card and reads as pressed-in.
```
rounded-2xl border border-alibi-blue/10 bg-alibi-lavender/10
shadow-[inset_0_2px_6px_rgba(50,83,199,0.08)]
```

### `.alibi-block-item`
Concave list item. Time blocks, observation cards in notes-mirror. Same inset shadow as `.alibi-doc-card` — hover deepens the tint slightly.
```
rounded-2xl bg-alibi-lavender/8 p-4
shadow-[0_1px_2px_rgba(50,83,199,0.05),inset_0_2px_5px_rgba(50,83,199,0.08)]
transition hover:bg-alibi-lavender/15
```

### `.alibi-doc-card`
Concave inner tile. Nested inside `.alibi-card` — examples, prompts, roadmap items, ADHD pattern grid. No border; inset shadow creates a recessed look.
```
rounded-2xl bg-alibi-lavender/8 p-4
shadow-[0_1px_2px_rgba(50,83,199,0.05),inset_0_2px_5px_rgba(50,83,199,0.08)]
```

---

## banners

### `.alibi-banner-error`
Error or warning notice.
```
rounded-2xl border border-alibi-pink/20 bg-alibi-pink/8 px-4 py-3
text-sm font-semibold text-alibi-pink
```

### `.alibi-banner-info`
Info or empty-state notice.
```
rounded-2xl border border-alibi-lavender/20 bg-alibi-lavender/8 px-4 py-3
text-sm font-semibold text-alibi-teal
```

---

## interactive components

### `.alibi-button-primary`
Filled blue. Primary actions: start, save, sign up. Hover → pink.
```
rounded-2xl bg-alibi-blue px-4 font-bold text-white transition
shadow-[0_2px_6px_rgba(50,83,199,0.20),0_4px_14px_rgba(50,83,199,0.16)]
hover:-translate-y-0.5 hover:bg-alibi-pink disabled:translate-y-0 disabled:opacity-55
```
Override `rounded-2xl` → `rounded-full` for pill CTAs on landing/marketing pages.

### `.alibi-button-teal`
Filled teal. Start, resume, send, save actions. Hover → blue.
```
rounded-2xl bg-alibi-teal font-bold text-white transition
shadow-[0_2px_6px_rgba(67,132,157,0.22),0_4px_14px_rgba(67,132,157,0.18)]
hover:-translate-y-0.5 hover:bg-alibi-blue disabled:translate-y-0 disabled:opacity-55
```

### `.alibi-button-stop`
Filled pink. Stop timer, destructive actions. Hover → blue.
```
rounded-2xl bg-alibi-pink font-bold text-white transition
shadow-[0_2px_6px_rgba(191,125,173,0.22),0_4px_14px_rgba(191,125,173,0.18)]
hover:-translate-y-0.5 hover:bg-alibi-blue disabled:translate-y-0 disabled:opacity-55
```

### `.alibi-button-secondary`
Ghost button. Secondary/cancel actions. Hover → pink border + text.
```
rounded-2xl border border-alibi-lavender/40 bg-white px-4 font-bold text-alibi-blue transition
shadow-[0_1px_3px_rgba(50,83,199,0.06),0_3px_8px_rgba(50,83,199,0.07)]
hover:-translate-y-0.5 hover:border-alibi-pink hover:text-alibi-pink disabled:translate-y-0 disabled:opacity-55
```

**Button sizing** — handled contextually with utility classes, not baked into the component class:

| Size | Classes to add |
|---|---|
| Large (stop/start) | `inline-flex h-11 min-w-32 items-center justify-center gap-2 px-4 text-sm font-black` |
| Standard | `inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-black` |
| Icon square | `inline-flex h-11 w-11 items-center justify-center` |
| Small | `inline-flex h-9 items-center justify-center gap-1.5 px-3 text-xs font-black` |

### Icon action buttons
Block item actions (chat, edit, delete) and similar inline icon buttons use `rounded-full` with a solid fill on hover — the fill color matches the button's semantic role:

| Role | Default | Hover |
|---|---|---|
| Chat (teal action) | `text-alibi-teal` | `hover:bg-alibi-teal hover:text-white` |
| Edit (primary action) | `text-alibi-teal` | `hover:bg-alibi-blue hover:text-white` |
| Delete (destructive) | `text-alibi-pink` | `hover:bg-alibi-pink hover:text-white` |

Base: `flex h-9 w-9 items-center justify-center rounded-full transition hover:-translate-y-0.5`

Never use `rounded-2xl` on icon-only buttons. Never use a soft tint (`hover:bg-alibi-lavender/20`) — the fill must be solid.

### Nav link hover (sidebar / docs)
Sidebar nav links (`rounded-xl`) use the concave shadow on hover to create a pressed-in feel:
```
rounded-xl px-2 py-1.5 font-semibold text-alibi-teal transition
hover:bg-alibi-lavender/10 hover:text-alibi-pink
hover:shadow-[inset_0_2px_5px_rgba(50,83,199,0.08)]
```
Use `transition` (not `transition-colors`) so the shadow animates.

### TopNav inactive link hover
Top-nav inactive links use a solid teal fill on hover — distinct from the active state (`bg-alibi-blue`):
```
hover:bg-alibi-teal hover:text-white
```

### `.alibi-input`
Text input / textarea / select. Inner shadow creates a pressed-in feel.
```
rounded-2xl border border-alibi-lavender/40 bg-white px-3 text-base text-alibi-ink outline-none transition
shadow-[inset_0_1px_3px_rgba(50,83,199,0.07)]
focus:border-alibi-pink focus:ring-2 focus:ring-alibi-pink/20
```

### `.alibi-chat-bubble`
Base class for chat message divs. Add role-specific color + alignment classes on top.
```
max-w-[88%] break-words rounded-2xl px-3 py-2 text-sm font-semibold leading-6
```
Usage:
```tsx
className={cn(
  "alibi-chat-bubble",
  role === "user"
    ? "ml-auto bg-alibi-blue text-white"
    : "mr-auto bg-white text-alibi-ink shadow-[0_1px_3px_rgba(50,83,199,0.06)]"
)}
```

---

## small tokens

### `.alibi-chip`
Inline tag/badge. Hashtags, category pills.
```
rounded-full bg-alibi-lavender/20 px-2.5 py-1 font-mono text-xs font-bold text-alibi-blue
```

### `.alibi-label`
Small uppercase monospace label. Section badges, status indicators.
```
font-mono text-xs font-black uppercase tracking-[0.12em] text-alibi-teal
```

---

## typography

| Level | Classes |
|---|---|
| Page h1 | `text-[1.9rem] font-black tracking-tight text-alibi-blue` |
| Section h2 | `text-[17px] font-black tracking-tight text-alibi-blue` |
| Card h3 | `text-[14px] font-semibold tracking-tight text-alibi-ink` |
| Primary body | `text-base text-alibi-ink` (17px base via `body`) |
| Secondary body | `text-sm leading-6 text-alibi-teal` |
| Small | `text-xs font-semibold text-alibi-teal` |
| Mono label | `font-mono text-xs text-alibi-teal/70` |

---

## layout

- Page wrapper: `.alibi-page` (`min-h-screen text-alibi-ink`)
- Max width: `max-w-[1180px]` (app pages)
- Padding: `p-6 sm:p-8`
- Card gap: `gap-5` between top-level sections

---

## animations

| Class | Effect |
|---|---|
| `.alibi-soft-rise` | New messages / list items fade up 4px (200ms ease-out) |
| `.alibi-fade-in` | Transient confirmations fade in (240ms ease-out) |
| `.alibi-record-pulse` | Voice button scale 1→1.05 while recording (2s loop) |
| `.alibi-listen-dot` | Listening indicator ring breath (2.4s loop) |

---

## deprecated

`lib/ui-styles.ts` exists only because one unused component imports it. Do not use in new code.

| Legacy | Replacement |
|---|---|
| `GLASS_PANEL_STYLE` | `.alibi-card` |
| `GLASS_PILL_STYLE` | `.alibi-pill` |
| `PAPER_INSET_STYLE` | `.alibi-inset` |
| `PRIMARY_BUTTON_STYLE` | `.alibi-button-primary` |
| `ALIBI.blue` etc. | `text-alibi-blue` etc. |
