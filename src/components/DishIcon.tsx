/**
 * Small flat dish icons for the sample-recipes list — inline SVG so no image
 * assets or new dependencies are needed. Each icon uses a muted badge tint
 * plus one accent color pulled loosely from the app's existing palette
 * (layout.ts's LINE_COLOR / GROUP_COLOR_ORDER), so the row reads as part of
 * the same visual system rather than a random photo.
 */

export type DishKind = "brownies" | "cookies" | "lemon-bars" | "tofu" | "chole";

const BADGE_BG = "#f2f0e6";

function Brownies() {
  return (
    <>
      <rect x="10" y="11" width="16" height="14" rx="2" fill="#6b4226" />
      <rect x="10" y="11" width="16" height="14" rx="2" fill="none" stroke="#4a2c17" strokeWidth="1.4" />
      <path d="M18 11v14M10 18h16" stroke="#4a2c17" strokeWidth="1" strokeOpacity="0.6" />
    </>
  );
}

function Cookies() {
  return (
    <>
      <circle cx="18" cy="18" r="8" fill="#c98a4b" />
      <circle cx="18" cy="18" r="8" fill="none" stroke="#8a5a2b" strokeWidth="1.2" />
      <circle cx="15" cy="15" r="1.1" fill="#4a2c17" />
      <circle cx="21" cy="16" r="1.1" fill="#4a2c17" />
      <circle cx="17" cy="21" r="1.1" fill="#4a2c17" />
      <circle cx="21.5" cy="20.5" r="1.1" fill="#4a2c17" />
    </>
  );
}

function LemonBars() {
  return (
    <>
      <rect x="9" y="19" width="18" height="6" rx="1.5" fill="#c98a4b" />
      <rect x="9" y="11" width="18" height="8" rx="1.5" fill="#eda100" />
      <path d="M9 19h18" stroke="#8a5a2b" strokeWidth="1" strokeOpacity="0.6" />
    </>
  );
}

function Tofu() {
  return (
    <>
      <rect x="10" y="10" width="16" height="16" rx="2" fill="#fdf7d8" stroke="#d8cf9a" strokeWidth="1.4" />
      <path d="M10 16h16M18 10v16" stroke="#d8cf9a" strokeWidth="1" />
      <circle cx="24" cy="12.5" r="1" fill="#2f7d4f" />
      <circle cx="21.5" cy="10.5" r="1" fill="#2f7d4f" />
    </>
  );
}

function Chole() {
  return (
    <>
      <path d="M9 16a9 6.5 0 0 0 18 0z" fill="#a8461e" />
      <path d="M9 16a9 6.5 0 0 0 18 0" fill="none" stroke="#7a3115" strokeWidth="1.2" />
      <ellipse cx="18" cy="15.5" rx="9" ry="2.4" fill="#c9713f" />
      <circle cx="14.5" cy="15" r="1" fill="#e8c98a" />
      <circle cx="18" cy="16.2" r="1" fill="#e8c98a" />
      <circle cx="21.5" cy="14.8" r="1" fill="#e8c98a" />
    </>
  );
}

const ICONS: Record<DishKind, () => React.JSX.Element> = {
  brownies: Brownies,
  cookies: Cookies,
  "lemon-bars": LemonBars,
  tofu: Tofu,
  chole: Chole,
};

export default function DishIcon({ kind }: { kind: DishKind }) {
  const Shape = ICONS[kind];
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <rect width="36" height="36" rx="8" fill={BADGE_BG} />
      <Shape />
    </svg>
  );
}
