# Target Audience & Product Strategy

> Living document — AI agents reference this to align every feature, UI decision, and priority with the product's goals.

## User Persona

### Primary (Now)

- **Developers** — want a design tool that lives in their code editor; version-control-friendly; no context switch
- **AI Agents / LLMs** — read, write, and reason about `.fd` text directly; ~6× fewer tokens than Excalidraw JSON; semantic naming + constraints enable intent-level understanding

### Aspirational (Future)

- **Everyone** — designers, PMs, students, hobbyists. The tool should be simple enough that anyone can pick it up, powerful enough that professionals stay.

## Distribution Channels

| Channel | Status | Priority |
|---------|--------|----------|
| VS Code / Cursor Marketplace | 🟢 Published | Primary |
| [fast-draft.com](https://fast-draft.com) web editor | 🟢 Live | Primary |
| Word of mouth | Active | Secondary |
| LinkedIn / social media | Starting | Secondary |
| Desktop app (Tauri) | ⬜ Planned | Next big bet |

## Design References

The canvas experience should feel like a blend of:

| App | What to emulate |
|-----|----------------|
| **Apple Freeform** | Simplicity, gesture-first, native feel, effortless onboarding |
| **Excalidraw** | Hand-drawn charm, instant usability, zero learning curve |
| **Sketch** | Precision, professional-grade tools, clean inspector |
| **Figma** | Collaboration patterns, component model, keyboard-centric power |

**Unique differentiator:** All of the above, but with native AI agent interaction — LLMs can read, write, and manipulate designs as text.

## Definition of Success

1. **Smooth & performant** — 60fps canvas, <16ms sync, instant tool response
2. **Simple & easy to use** — new users productive in <2 minutes; zero tutorial needed
3. **AI-comprehensible** — agents understand and manipulate `.fd` files with high accuracy
4. **Scalable architecture** — designed for 1000+ node documents, multi-platform, future collaboration

## Known Pain Points (March 2025)

> Tools must work as intended. Simple operations that fail or behave unexpectedly are the #1 frustration.

Priority: fix existing tool reliability before adding new features. Every draw/select/resize/move gesture must be bulletproof.

## Platform Priority Stack

```
1. VS Code Extension — current focus, primary distribution
2. Desktop App (Tauri) — next big bet, native experience, full keyboard shortcuts
3. Web App — standalone fast-draft.com web editor
4. iOS App — eventual path, Apple Pencil + touch-first
5. Android — after iOS
```

## Growth Stage

**Pre-launch / 0 users.** Designing for scalability from day one. Current focus: product quality and reliability over growth hacking.

## Metrics to Track (When Ready)

- VS Code extension installs + weekly active users
- fast-draft.com web editor sessions / bounce rate
- AI Touch calls/day (proxy for AI agent engagement)
- GitHub stars + community issues
- Time-to-first-shape for new users (onboarding metric)
