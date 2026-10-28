// Layout catalog — the premade section templates the author stacks to build a
// page. This is the V4 analog of real Iceberg's layout registry (the `section`
// block of `core-next/schemas.ts`, served to the CMS "Layout Picker"). Every
// entry here is a REAL Iceberg section layout: the id/name/experiment flag come
// straight from the production schemas, and each `preview` points at the real
// Mobile/Desktop preview art shipped in the elements package (copied into
// public/layout-previews/**, proposition = nbcu/Peacock).
//
// A layout is a Section template; its editable fields come from the element
// registry (by objectType) and the seeded values live on each instance's
// `content`. The Layout Picker never mutates data — it asks this catalog for a
// fresh subtree, which the shell inserts at the chosen slot.
import type { IconName } from "./ui-lib/Icon";
import type { StructureNode, StructureObjectType } from "./data";
import { createWidgetChild } from "./data";
import { buildSectionFromSchema } from "./schemaModel";
import { fillSampleContent } from "./layout-samples";

// Fresh, collision-proof ids for every node in a newly built subtree.
let seq = 0;
const uid = (p: string): string =>
  `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// Picker groups (a redesign nicety — the real picker is a flat A–Z list, but
// grouping the 40 layouts makes the catalog scannable). Search flattens these.
export type LayoutGroup =
  | "Plan Pickers"
  | "Content"
  | "Media & Grids"
  | "Commerce"
  | "Structure"
  | "Logic & Targeting";

// Real preview art shipped in the zip (filenames under public/layout-previews/).
// The real CMS shows Mobile + Desktop (or a single UI) image per layout.
export interface LayoutPreview {
  desktop?: string;
  mobile?: string;
  ui?: string;
}

export interface LayoutDef {
  id: string;
  name: string;
  description: string;
  group: LayoutGroup;
  icon: IconName;
  // The REAL layout schema id (a key of schemas/layoutSchemas.json). Inserting a
  // layout builds its subtree from THIS schema, so the section arrives with the
  // exact set of elements/fields the design team defined (not an empty shell).
  schemaId: string;
  // Lifecycle badge shown in the picker (real Iceberg's `moduleStatus`). In prod
  // this is a per-artifact CMS override; here it follows the app's live config.
  experiment?: boolean;
  preview?: LayoutPreview;
}

// Build a fresh, pre-filled page-section subtree for a catalog layout, straight
// from its real schema (every field + nested collection the design team defined,
// seeded so the tree/preview aren't empty). Falls back to a titled content
// section only if the schema id somehow isn't present.
export function buildLayoutNode(def: LayoutDef): StructureNode {
  const node = buildSectionFromSchema(def.schemaId, def.name, def.name) ?? simple(def.name);
  // A new section lands filled with sample content (see layout-samples.ts).
  fillSampleContent(node, def.id, def.name);
  return node;
}

// --- Subtree builders -------------------------------------------------------

// A section wrapping a single content-block module (Hero / Banner / FAQ …).
function contentSection(
  label: string,
  role: string,
  blockLabel: string,
  seed: Record<string, string>,
): StructureNode {
  const sectionId = uid("section");
  return {
    id: uid("sec"),
    label,
    objectType: "page-section",
    sectionId,
    role,
    design: "Custom",
    defaultExpanded: true,
    children: [
      { id: uid("cb"), label: blockLabel, objectType: "content-block", content: seed },
      {
        id: uid("so"),
        label: "Section Options",
        objectType: "section-options",
        design: "Custom",
      },
      { id: uid("bh"), label: "Behaviours", objectType: "behaviours" },
    ],
  };
}

// Fallback section for the rare case a schema id is missing — drops a titled
// content section so insertion still works and the tree stays consistent.
function simple(name: string): StructureNode {
  return contentSection(name, name, `${name} Content`, {
    Title: name,
    Subtitle: "Edit this section's content in the panel on the right.",
  });
}

// Preview helpers keyed to the copied art (public/layout-previews/<id>-*.png).
const dm = (id: string): LayoutPreview => ({
  desktop: `${id}-desktop.png`,
  mobile: `${id}-mobile.png`,
});
const uiOnly = (id: string): LayoutPreview => ({ ui: `${id}-ui.png` });

// --- The catalog ------------------------------------------------------------
// The full set of production Iceberg layouts (proposition = Peacock / NBCU).

export const LAYOUT_CATALOG: LayoutDef[] = [
  // ---- Plan Pickers --------------------------------------------------------
  {
    id: "plan-picker-single-diff",
    name: "Plan Picker - Single Difference",
    description:
      "Compare plans that differ on a single dimension. Plans tab caps at 4 (real tabsConfig.maxSize).",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-single-diff"),
    schemaId: "section-ia-plan-picker-single-diff",
  },
  {
    id: "plan-picker-multi-diff",
    name: "Plan Picker - Multi Difference",
    description: "Compare plans across several features. Plans tab caps at 5.",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-multi-diff"),
    schemaId: "section-ia-plan-picker-multi-diff",
  },
  {
    id: "plan-picker-mini",
    name: "Plan Picker - Mini Picker",
    description: "A compact plan selector for tight spaces.",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-mini"),
    schemaId: "section-ia-plan-picker-mini-picker",
  },
  {
    id: "plan-picker-dual-mini",
    name: "Plan Picker - Dual Mini Picker",
    description: "Two mini pickers side by side for toggled offers.",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-dual-mini"),
    schemaId: "section-ia-plan-picker-dual-mini-picker",
  },
  {
    id: "plan-picker-graphic-radio",
    name: "Plan Picker - Graphic Radio",
    description: "Graphic radio cards for selecting a plan.",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-graphic-radio"),
    schemaId: "section-ia-plan-picker-graphic-radio",
  },
  {
    id: "plan-picker-plan-builder",
    name: "Plan Picker - Plan Builder",
    description: "Let customers assemble a plan from add-on tiles.",
    group: "Plan Pickers",
    icon: "grid",
    preview: {
      desktop: "plan-picker-plan-builder-desktop.png",
      mobile: "plan-picker-plan-builder-mobile.png",
      ui: "plan-picker-plan-builder-ui.png",
    },
    schemaId: "section-ia-plan-builder",
  },
  {
    id: "plan-picker-cta",
    name: "Plan Picker with CTAs",
    description: "Plan cards with prominent per-plan call-to-action buttons.",
    group: "Plan Pickers",
    icon: "grid",
    preview: dm("plan-picker-cta"),
    schemaId: "section-ia-plan-picker-cta",
  },

  // ---- Content -------------------------------------------------------------
  {
    id: "hero",
    name: "Hero",
    description: "A full-bleed headline band with supporting copy and a CTA.",
    group: "Content",
    icon: "image",
    preview: dm("hero"),
    schemaId: "section-ia-hero-template",
  },
  {
    id: "content-banner",
    name: "Content Banner",
    description: "A promotional message band for offers and announcements.",
    group: "Content",
    icon: "doc-text",
    preview: dm("content-banner"),
    schemaId: "section-ia-content-promotional-banner",
  },
  {
    id: "banner",
    name: "Banner",
    description: "A lightweight banner for messaging or upsell.",
    group: "Content",
    icon: "doc-text",
    experiment: true,
    preview: dm("banner"),
    schemaId: "section-ia-banner-template",
  },
  {
    id: "countdown",
    name: "Countdown",
    description: "A ticking countdown to a launch, price rise, or event.",
    group: "Content",
    icon: "clock",
    preview: dm("countdown"),
    schemaId: "section-ia-countdown",
  },
  {
    id: "key-art-synopsis",
    name: "Key Art & Synopsis",
    description: "Title key art paired with a synopsis and metadata.",
    group: "Content",
    icon: "image",
    preview: dm("key-art-synopsis"),
    schemaId: "section-ia-key-art-synopsis-template",
  },
  {
    id: "text-tcs",
    name: "Text & TCs",
    description: "Rich text block for terms, conditions, and legal copy.",
    group: "Content",
    icon: "doc-text",
    preview: dm("text-tcs"),
    schemaId: "section-ia-text-tcs",
  },
  {
    id: "faqs",
    name: "FAQ's",
    description: "An expandable list of questions and answers.",
    group: "Content",
    icon: "help",
    preview: dm("faqs"),
    schemaId: "section-ia-faqs",
  },
  {
    id: "highlights",
    name: "Highlights",
    description: "A carousel of highlight cards showcasing key benefits.",
    group: "Content",
    icon: "star",
    preview: dm("highlights"),
    schemaId: "section-highlights",
  },

  // ---- Media & Grids -------------------------------------------------------
  {
    id: "carousel",
    name: "Carousel",
    description: "A scrollable row of recommended titles or collections.",
    group: "Media & Grids",
    icon: "blocks",
    experiment: true,
    preview: dm("carousel"),
    schemaId: "section-ia-carousel",
  },
  {
    id: "cast-layout",
    name: "Cast Layout",
    description: "A grid of cast members with headshots and names.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("cast-layout"),
    schemaId: "section-ia-cast",
  },
  {
    id: "content-grid",
    name: "Content Grid",
    description: "A responsive grid of content thumbnails.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("content-grid"),
    schemaId: "section-ia-content-grid",
  },
  {
    id: "content-promotional-rail",
    name: "Content Promotional Rail",
    description: "A promotional rail of featured content tiles.",
    group: "Media & Grids",
    icon: "blocks",
    preview: dm("content-promotional-rail"),
    schemaId: "section-ia-content-promo-rail",
  },
  {
    id: "filtered-grid",
    name: "Filtered Grid",
    description: "A content grid with genre / category filters.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("filtered-grid"),
    schemaId: "section-ia-filtered-grid",
  },
  {
    id: "logo-grid",
    name: "Logo Grid",
    description: "A grid of partner or channel logos.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("logo-grid"),
    schemaId: "section-ia-logo-grid",
  },
  {
    id: "sle-carousel",
    name: "SLE Carousel",
    description: "A single-live-event carousel with schedule tiles.",
    group: "Media & Grids",
    icon: "blocks",
    preview: dm("sle-carousel"),
    schemaId: "section-ia-sle-carousel",
  },
  {
    id: "seasons-episodes",
    name: "Seasons/Episodes List",
    description: "A seasons and episodes browser for a series.",
    group: "Media & Grids",
    icon: "blocks",
    preview: dm("seasons-episodes"),
    schemaId: "section-ia-episodes",
  },
  {
    id: "catalogue",
    name: "Catalogue",
    description: "An IA catalogue browse layout with SEO metadata.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("catalogue"),
    schemaId: "section-peacock-catalogue",
  },
  {
    id: "channels-guide",
    name: "Channels Guide",
    description: "A live channels guide with schedule.",
    group: "Media & Grids",
    icon: "blocks",
    preview: dm("channels-guide"),
    schemaId: "section-ia-channels-live-schedule",
  },
  {
    id: "comparison-table",
    name: "Comparison Table",
    description: "A feature-by-feature comparison table.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("comparison-table"),
    schemaId: "section-ia-comparison-table",
  },
  {
    id: "comparison-table-modal",
    name: "Comparison table - Modal",
    description: "A comparison table presented inside a modal.",
    group: "Media & Grids",
    icon: "grid",
    preview: dm("comparison-table-modal"),
    schemaId: "section-ia-modal",
  },

  // ---- Commerce ------------------------------------------------------------
  {
    id: "incremental-add-ons",
    name: "Incremental Add-Ons",
    description: "Upsell add-on tiles layered onto a base plan.",
    group: "Commerce",
    icon: "cube",
    preview: dm("incremental-add-ons"),
    schemaId: "section-ia-incremental-add-ons",
  },
  {
    id: "payment-options",
    name: "Payment Options Template",
    description: "Selectable payment methods and cadences.",
    group: "Commerce",
    icon: "sliders",
    preview: dm("payment-options"),
    schemaId: "section-ia-payment-options",
  },
  {
    id: "paid-sharing",
    name: "Paid Sharing",
    description: "Paid account-sharing add-on flow.",
    group: "Commerce",
    icon: "cube",
    preview: dm("paid-sharing"),
    schemaId: "section-ia-paid-sharing",
  },
  {
    id: "sticky-basket",
    name: "Sticky Basket",
    description: "A persistent basket summary that sticks on scroll.",
    group: "Commerce",
    icon: "clipboard-check",
    preview: dm("sticky-basket"),
    schemaId: "section-ia-sticky-basket-template",
  },
  {
    id: "mlb-lookup",
    name: "MLB Lookup",
    description: "MLB team lookup for regional sports entitlement.",
    group: "Commerce",
    icon: "trophy",
    preview: dm("mlb-lookup"),
    schemaId: "section-ia-mlb-lookup",
  },
  {
    id: "regional-sports-network",
    name: "Regional Sports Network",
    description: "RSN entitlement and team-network cards.",
    group: "Commerce",
    icon: "trophy",
    preview: dm("regional-sports-network"),
    schemaId: "section-ia-regional-sports-network",
  },

  // ---- Structure -----------------------------------------------------------
  {
    id: "seo-footer",
    name: "SEO Footer",
    description: "Footer navigation and legal content areas.",
    group: "Structure",
    icon: "file",
    preview: dm("seo-footer"),
    schemaId: "section-ia-footer-navigation",
  },
  {
    id: "sub-navigation",
    name: "Sub-Navigation",
    description: "An in-page sub-navigation / anchor bar.",
    group: "Structure",
    icon: "redirect",
    preview: dm("sub-navigation"),
    schemaId: "section-ia-header",
  },
  {
    id: "steps",
    name: "Steps",
    description: "A numbered how-it-works / supported-devices sequence.",
    group: "Structure",
    icon: "blocks",
    preview: dm("steps"),
    schemaId: "section-ia-supported-devices",
  },

  // ---- Logic & Targeting ---------------------------------------------------
  {
    id: "audience-selection",
    name: "Audience Selection",
    description: "Route audiences by query parameters to different content.",
    group: "Logic & Targeting",
    icon: "flask",
    preview: uiOnly("audience-selection"),
    schemaId: "section-query-parameters-decider",
  },
  {
    id: "experiment",
    name: "Experiment",
    description: "An A/B decider that splits traffic between variations.",
    group: "Logic & Targeting",
    icon: "flask",
    preview: uiOnly("experiment"),
    schemaId: "section-a-b-decider",
  },
  {
    id: "segment-targeting",
    name: "Segment Targeting",
    description: "A roadblock that targets specific customer segments.",
    group: "Logic & Targeting",
    icon: "flask",
    preview: uiOnly("segment-targeting"),
    schemaId: "section-roadblock",
  },
  {
    id: "personalisation",
    name: "Personalisation",
    description: "Personalised content driven by customer signals.",
    group: "Logic & Targeting",
    icon: "sparkles",
    // No preview art ships for this layout (matches production's "No preview").
    schemaId: "section-personalisation",
  },
];

export function getLayoutDef(id: string): LayoutDef | undefined {
  return LAYOUT_CATALOG.find((l) => l.id === id);
}

// --- Container child factory ------------------------------------------------
// Instantiates a fresh child instance for a container's "Add {itemNoun}" action
// (the tabs "push empty tab" analog). The element's SCHEMA supplies the fields;
// a friendly default label seeds a recognisable card/row immediately.
const CHILD_LABELS: Partial<Record<StructureObjectType, string>> = {
  product: "New plan",
  plan: "New plan",
  feature: "New feature",
  cadence: "New cadence",
  "pricing-option": "New cadence",
  category: "New category",
  variation: "New variation",
};

export function createChildNode(type: StructureObjectType): StructureNode {
  // Retention widget children (offers / responses / segmentation) carry their
  // own schema-driven props; delegate to the widget factory first.
  const widgetChild = createWidgetChild(type);
  if (widgetChild) return widgetChild;

  const label = CHILD_LABELS[type] ?? "New item";
  const node: StructureNode = { id: uid("new"), label, objectType: type };
  // Seed a product's title so its preview card is legible on creation, plus its
  // (empty) Product Features collection — the schema's `productList` tabs
  // (minSize 0) is part of every product, so the card panel always offers
  // "Add Feature" even before the first bullet exists.
  if (type === "product" || type === "plan") {
    node.content = { "Product Title": label };
    node.children = [
      {
        id: uid("feats"),
        label: "Product Features",
        objectType: "product-features-list",
      },
    ];
  }
  // A category holds its plans in a Products collection (the schema's Plan
  // Picker Data tabs) — seed an empty one so the author can immediately add
  // products (and see cards) without first building the container by hand.
  if (type === "category") {
    node.children = [
      { id: uid("prods"), label: "Products", objectType: "products" },
    ];
  }
  return node;
}
