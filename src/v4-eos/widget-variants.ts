// Variants for widgets (the "Variants for /slug" list). Production variants were
// captured for /basket-upsell-config; layout widgets carry a few sample variants
// that each open as their own editable copy of the layout.

import { LAYOUT_CATALOG } from "./layouts";
import { layoutWidgetSlug } from "./layout-widgets";

export interface WidgetVariant {
  id: string;
  name: string;
  qaStatus: "Approved" | "In review" | "—";
  published: boolean;
  /** Scheduled release day, or null when not scheduled. */
  scheduledAt: Date | null;
  createdDate: string;
  modifiedDate: string;
  modifiedBy: string;
  /** Layout widgets only: the section heading this variant starts with. */
  heading?: string;
}

// Captured from production "Variants for /basket-upsell-config".
const PRODUCTION_VARIANTS: Record<string, WidgetVariant[]> = {
  "/basket-upsell-config": [
    {
      id: "wv-basket-tanya-test",
      name: "Tanya Test",
      qaStatus: "—",
      published: false,
      scheduledAt: null,
      createdDate: "Tue 20 Oct 26",
      modifiedDate: "Wed 21 Oct 26",
      modifiedBy: "Reeves, Tanya",
    },
    {
      id: "wv-basket-copy-of-variant-1",
      name: "Copy of variant 1",
      qaStatus: "—",
      published: true,
      scheduledAt: null,
      createdDate: "Mon 20 Jul 26",
      modifiedDate: "Mon 20 Jul 26",
      modifiedBy: "Maher, Jamie",
    },
    {
      id: "wv-basket-variant-1",
      name: "variant 1",
      qaStatus: "—",
      published: false,
      scheduledAt: null,
      createdDate: "Tue 19 May 26",
      modifiedDate: "Tue 19 May 26",
      modifiedBy: "Maher, Jamie",
    },
  ],
};

// Sample variants for a handful of layouts, keyed by layout id (the widget's slug
// is worked out from the layout, so a suffixed slug still lines up).
const LAYOUT_VARIANTS_BY_LAYOUT: Record<string, WidgetVariant[]> = {
  hero: [
    {
      id: "wv-hero-sports",
      name: "Sports hero",
      qaStatus: "Approved",
      published: true,
      scheduledAt: new Date(2026, 10, 2),
      createdDate: "Mon 12 Oct 26",
      modifiedDate: "Thu 22 Oct 26",
      modifiedBy: "Vidal, Sebastian",
      heading: "Watch every live game this season",
    },
    {
      id: "wv-hero-summer",
      name: "Summer hero",
      qaStatus: "In review",
      published: false,
      scheduledAt: null,
      createdDate: "Fri 16 Oct 26",
      modifiedDate: "Fri 16 Oct 26",
      modifiedBy: "Collins, Morgan",
      heading: "Your summer watchlist starts here",
    },
  ],
  "plan-picker-single-diff": [
    {
      id: "wv-ppsd-control",
      name: "Control",
      qaStatus: "Approved",
      published: true,
      scheduledAt: null,
      createdDate: "Tue 06 Oct 26",
      modifiedDate: "Tue 13 Oct 26",
      modifiedBy: "Constantino, Bella",
      heading: "Choose the plan that fits you",
    },
    {
      id: "wv-ppsd-compare",
      name: "Compare plans",
      qaStatus: "In review",
      published: false,
      scheduledAt: new Date(2026, 10, 9),
      createdDate: "Wed 14 Oct 26",
      modifiedDate: "Mon 26 Oct 26",
      modifiedBy: "Bueno, Fernanda",
      heading: "Compare plans side by side",
    },
    {
      id: "wv-ppsd-spanish",
      name: "Spanish copy",
      qaStatus: "—",
      published: false,
      scheduledAt: null,
      createdDate: "Thu 22 Oct 26",
      modifiedDate: "Thu 22 Oct 26",
      modifiedBy: "Bueno, Fernanda",
      heading: "Compara los planes",
    },
  ],
  faqs: [
    {
      id: "wv-faqs-short",
      name: "Short list",
      qaStatus: "Approved",
      published: true,
      scheduledAt: null,
      createdDate: "Wed 08 Oct 26",
      modifiedDate: "Wed 08 Oct 26",
      modifiedBy: "Collins, Morgan",
      heading: "Frequently asked questions",
    },
  ],
  carousel: [
    {
      id: "wv-carousel-sports",
      name: "Sports row",
      qaStatus: "In review",
      published: false,
      scheduledAt: null,
      createdDate: "Mon 19 Oct 26",
      modifiedDate: "Tue 27 Oct 26",
      modifiedBy: "Vidal, Sebastian",
      heading: "Live sports on Peacock",
    },
    {
      id: "wv-carousel-new",
      name: "New releases",
      qaStatus: "—",
      published: true,
      scheduledAt: null,
      createdDate: "Fri 02 Oct 26",
      modifiedDate: "Fri 09 Oct 26",
      modifiedBy: "Constantino, Bella",
      heading: "New this week",
    },
  ],
  "content-banner": [
    {
      id: "wv-content-banner-offer",
      name: "Limited offer",
      qaStatus: "Approved",
      published: true,
      scheduledAt: null,
      createdDate: "Thu 15 Oct 26",
      modifiedDate: "Thu 15 Oct 26",
      modifiedBy: "Bueno, Fernanda",
      heading: "Limited-time offer",
    },
  ],
};

const LAYOUT_VARIANTS: Record<string, WidgetVariant[]> = Object.fromEntries(
  Object.entries(LAYOUT_VARIANTS_BY_LAYOUT).map(([layoutId, variants]) => {
    const def = LAYOUT_CATALOG.find((d) => d.id === layoutId);
    if (!def) throw new Error(`Unknown layout for variants: ${layoutId}`);
    return [layoutWidgetSlug(def), variants];
  }),
);

export const WIDGET_VARIANTS: Record<string, WidgetVariant[]> = {
  ...PRODUCTION_VARIANTS,
  ...LAYOUT_VARIANTS,
};

export function widgetVariantsFor(slug: string): WidgetVariant[] {
  return WIDGET_VARIANTS[slug] ?? [];
}
