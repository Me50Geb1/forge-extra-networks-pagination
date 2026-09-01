# Changelog

## 1.1.0 - 2026-09-01

### Added

- Automatically refresh Civitai Helper decorations after each successful LoRA page render
- Apply the refresh to page navigation, direct jumps, page-size changes, searches, and folder changes
- Use a short debounce and remain a no-op when Civitai Helper is not installed

## 1.0.0 - 2026-09-01

Initial public release.

### Added

- Server-side pagination for Forge Neo LoRA Extra Networks
- 25 / 50 / 60 / 100 / 200 items per page
- 60 items as default
- Previous / next page navigation
- Direct page jump menu
- Folder filtering support
- Search support
- txt2img and img2img support
- Toolbar integration
- Dark mode compatible page-size menu
- Compatibility-focused design for existing Extra Networks card extensions

### Fixed during development

- Incorrect folder filtering
- Pagination UI placement
- Search metadata containing `None`
- Duplicate pager creation while scrolling
- Loading screen lock caused by DOM observer loop
- Dark-mode menu visibility
