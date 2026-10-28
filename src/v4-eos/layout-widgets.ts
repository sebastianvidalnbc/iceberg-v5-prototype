// Layout widgets — every premade layout in the catalog is also a widget. The
// Widgets list shows one row per layout, and opening it puts that layout's
// section in the widget editor, where it previews and edits like a page section.
//
// Slugs follow the production naming (`/layout-id`). A layout whose plain slug
// already belongs to a production widget (e.g. `/seo-footer`) gets a `-layout`
// suffix so the two never collide.
import { LAYOUT_CATALOG, type LayoutDef } from "./layouts";
import { PRODUCTION_WIDGETS, type ProductionWidget } from "./production-widgets";

const PRODUCTION_SLUGS = new Set(PRODUCTION_WIDGETS.map((w) => w.slug));

export function layoutWidgetSlug(def: LayoutDef): string {
  const plain = `/${def.id}`;
  return PRODUCTION_SLUGS.has(plain) ? `${plain}-layout` : plain;
}

const DAY = 86_400_000;
// Sample "today" used for the relative Modified strings (matches the Widgets
// list's sample timeframe, late October 2026).
const SAMPLE_NOW = Date.UTC(2026, 9, 28);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCreated(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${WEEKDAYS[d.getUTCDay()]} ${dd} ${MONTHS[d.getUTCMonth()]} ${yy}`;
}

function formatAgo(ts: number): string {
  const days = Math.round((SAMPLE_NOW - ts) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

// One production-shaped row per catalog layout, spread over the previous months
// so the list doesn't open on a single block of identical dates.
export const LAYOUT_WIDGETS: ProductionWidget[] = LAYOUT_CATALOG.map((def, i) => {
  const createdAt = SAMPLE_NOW - (10 + ((i * 37) % 150)) * DAY;
  const modifiedAt = Math.min(SAMPLE_NOW - DAY, createdAt + ((i * 11) % 40) * DAY);
  return {
    slug: layoutWidgetSlug(def),
    layoutId: def.id,
    format: "HTML",
    status: i % 6 === 5 ? "Draft" : "Published",
    created: formatCreated(createdAt),
    modified: formatAgo(modifiedAt),
    createdAt,
    modifiedAt,
  };
});

export function layoutDefForWidget(slug: string): LayoutDef | undefined {
  return LAYOUT_CATALOG.find((d) => layoutWidgetSlug(d) === slug);
}
