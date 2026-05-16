# Freedom OS — Change Log

Format: [YYYY-MM-DD HH:MM] | FILE: `path/to/file` | TYPE: (feature|fix|style|refactor|docs)
Author: AI Assistant / User
Description: What changed and why

---

## [UNRELEASED]

### 2026-05-10 23:00 | FILE: `js/modules/dashboard.js` | TYPE: fix
**Author:** AI Assistant  
**Description:** Fixed text clumping in dashboard stats display. Added 
spacing between labels and values. Changed `Active${count} Projects` to 
`Active: ${count} Projects` across all stat rows. Removed duplicate 
stats block that was rendering 3 identical sections.

**Lines Changed:** 45-78, 112-145  
**Testing:** Verified on Chrome 124, Firefox 126, Safari 17  
**Breaking Changes:** None

---

### 2026-05-10 23:15 | FILE: `css/components.css` | TYPE: style
**Author:** AI Assistant  
**Description:** Added neon glow effect to primary buttons using 
`box-shadow` with cyan/teal layers. Added hover state with intensified 
glow and subtle lift transform. Updated `.btn-primary` class.

**Lines Changed:** 201-225  
**Testing:** Verified glow renders correctly on dark backgrounds  
**Breaking Changes:** None

---

### 2026-05-10 23:30 | FILE: `css/layout.css` | TYPE: feature
**Author:** AI Assistant  
**Description:** Implemented custom glowing scrollbar. Uses 
`::-webkit-scrollbar` with gradient thumb in brand cyan. Added Firefox 
support via `scrollbar-color`. Scrollbar glow intensity increases on 
hover.

**Lines Changed:** 45-78  
**Testing:** Chrome, Firefox, Edge. Safari falls back to default.  
**Breaking Changes:** None

---

## [PENDING / BACKLOG]

- [ ] Add scroll-triggered atmosphere morphing (background shader)
- [ ] Implement particle network background for People page
- [ ] Add GSAP ScrollTrigger for page section reveals
- [ ] Create Stage Mode overlay improvements
- [ ] Add daily quote rotation system
- [ ] Finance page: add animated number tickers
- [ ] Dashboard: consolidate stats into single clean row
- [ ] Add `prefers-reduced-motion` support globally

---

## [COMPLETED MILESTONES]

### v0.1.0 — Initial Build
- Core SPA architecture with hash router
- All 13 modules created with basic functionality
- Dark theme base styling
- Countdown timer to May 21, 2029