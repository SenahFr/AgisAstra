# Project notes

- Reference viewport: the user works from a 13" MacBook Pro, browser viewport ~1434px wide. Use this as the default reference size for any sizing/layout decisions.
- Any direction to change a size/scale (fonts, images, icons, spacing, etc.) should be implemented responsively (e.g. `clamp()` with a `vw`-based middle value calibrated to the ~1434px reference) rather than as a fixed pixel value, unless the user explicitly asks for a fixed size.
