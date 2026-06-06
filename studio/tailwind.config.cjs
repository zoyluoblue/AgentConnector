/** @type {import('tailwindcss').Config} — ported from the user's Stitch design.
 * Colors are CSS variables (R G B triplets) so light/dark swap via the html class.
 * `<alpha-value>` keeps Tailwind's /opacity utilities (bg-claude/5, border-claude/20) working.
 */
const c = (n) => `rgb(var(--c-${n}) / <alpha-value>)`;
const TOKENS = [
  "secondary-fixed", "primary-fixed", "on-error", "on-tertiary-fixed", "primary-fixed-dim",
  "primary-container", "surface-tint", "on-error-container", "on-background", "tertiary-fixed",
  "secondary", "background", "secondary-container", "on-primary", "on-tertiary-fixed-variant",
  "tertiary", "on-primary-fixed", "inverse-surface", "surface-container-high", "primary",
  "surface-dim", "surface-container-highest", "surface-bright", "on-secondary-fixed",
  "on-primary-fixed-variant", "surface", "on-secondary-fixed-variant", "inverse-on-surface",
  "surface-container-low", "on-secondary", "outline", "on-tertiary", "on-secondary-container",
  "error", "surface-container-lowest", "on-surface-variant", "on-primary-container",
  "outline-variant", "error-container", "on-tertiary-container", "secondary-fixed-dim",
  "tertiary-fixed-dim", "surface-container", "on-surface", "tertiary-container",
  "surface-variant", "inverse-primary", "claude",
];

module.exports = {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: Object.fromEntries(TOKENS.map((n) => [n, c(n)])),
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: {
        stack_sm: "8px",
        stack_md: "16px",
        stack_lg: "24px",
        margin_page: "24px",
        sidebar_width: "260px",
        gutter: "16px",
      },
      fontFamily: {
        "body-sm": ["Inter", "PingFang SC", "sans-serif"],
        "label-caps": ["Inter", "sans-serif"],
        headline: ["Inter", "PingFang SC", "sans-serif"],
        code: ["JetBrains Mono", "monospace"],
        display: ["Inter", "PingFang SC", "sans-serif"],
        "body-lg": ["Inter", "PingFang SC", "sans-serif"],
      },
      fontSize: {
        "body-sm": ["12px", { lineHeight: "16px", fontWeight: "400" }],
        "label-caps": ["10px", { lineHeight: "12px", letterSpacing: "0.05em", fontWeight: "700" }],
        headline: ["18px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" }],
        code: ["13px", { lineHeight: "20px", fontWeight: "400" }],
        display: ["24px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "600" }],
        "body-lg": ["14px", { lineHeight: "20px", fontWeight: "400" }],
      },
    },
  },
};
