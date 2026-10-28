// V2 browse layer — PRESENTATION-ONLY derivation for the two list levels that
// sit above the editor, mirroring real Iceberg's flow:
//   Pages list  ─click slug▶  Variants list  ─click variant▶  Editor
// Everything here is derived from the existing PAGES_TREE / VARIANTS. No
// data-model changes: the extra columns real Iceberg shows (status, dates, QA,
// publish, last-modified-by) are SAMPLE metadata generated deterministically
// from each node id, so the tables look realistic without inventing a schema.
import { PAGES_TREE, WIDGETS_TREE, VARIANTS, type TreeNode } from "./data";
import { allWidgets, productionWidgetId } from "./widget-create";
import { PRODUCTION_WIDGET_SUBPAGES } from "./production-widget-subpages";
import { addDays, dayKey, parseSampleDay } from "./schedule";
import { widgetVariantsFor } from "./widget-variants";

// The browse layer serves two parallel collection contexts that share identical
// table machinery: Pages (PAGES_TREE) and Widgets (WIDGETS_TREE). A single
// BrowseContext discriminator selects the source tree, the route base, and the
// list titles so PagesView/VariantsView render either without duplication.
export type BrowseContext = "page" | "widget";

function treeFor(context: BrowseContext): TreeNode[] {
  return context === "widget" ? WIDGETS_TREE : PAGES_TREE;
}

// --- Deterministic sample-metadata helpers ---------------------------------
// A stable hash so the same id always yields the same sample values (no random
// churn across renders / reloads). Prototype-only.
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h;
}

const EDITORS = [
  "Constantino, Bella",
  "Bueno, Fernanda",
  "Collins, Morgan",
  "Vidal, Sebastian",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

// A fake but stable "MMM DD" date derived from the id.
function sampleDate(id: string, salt: number): string {
  const h = hash(id + salt);
  const day = (h % 27) + 1;
  const month = MONTHS[h % MONTHS.length];
  return `${month} ${day} 26`;
}

// A fake but stable relative "modified" string, with the age it stands for so
// the table can sort on it.
const MODIFIED_AGO = [
  { label: "3 hours ago", hours: 3 },
  { label: "3 days ago", hours: 72 },
  { label: "12 days ago", hours: 288 },
  { label: "a month ago", hours: 720 },
];
const SAMPLE_NOW = Date.UTC(2026, 9, 15, 18);

function sampleModifiedAgo(id: string) {
  return MODIFIED_AGO[hash(id + "mod") % MODIFIED_AGO.length];
}

function sampleModified(id: string): string {
  return sampleModifiedAgo(id).label;
}

// Timestamp for a "MMM DD 26" sample date (sort key only).
function sampleDateTs(s: string): number {
  const [m, d] = s.split(" ");
  return Date.UTC(2026, MONTHS.indexOf(m), Number(d));
}

export type PageStatus = "Draft" | "Published";
export type Visibility = "Visible" | "Hidden";

// --- Slug rows (Pages level) -----------------------------------------------
// One row per page node. `depth` drives indentation; `childCount` shows how many
// sub-pages a slug owns; `variantCount` (when > 0) means the row is a leaf that
// owns Variants and is therefore clickable through to the Variants view.
export interface SlugRow {
  id: string;
  slug: string;
  depth: number;
  /** Depth-0 ancestor id — shared by a folder and the rows grouped under it. */
  groupId: string;
  /** Direct parent page id, or null for top-level rows. */
  parentId: string | null;
  hasChildren: boolean;
  childCount: number;
  variantCount: number;
  status: PageStatus;
  /** Production `protect` — QA-locked pages that cannot be unpublished freely. */
  protect: boolean;
  visibility: Visibility;
  unpublishDate: string | null;
  created: string;
  modified: string;
  /** Sort keys (ms since epoch) for the date columns; null when shown as "—". */
  unpublishAt: number | null;
  createdAt: number | null;
  modifiedAt: number | null;
}

function variantChildCount(node: TreeNode): number {
  return (node.children ?? []).filter((c) => c.type === "variant").length;
}

function pageChildCount(node: TreeNode): number {
  return (node.children ?? []).filter((c) => c.type !== "variant").length;
}

function toSlugRow(node: TreeNode, depth: number, groupId: string, parentId: string | null): SlugRow {
  const variantCount = variantChildCount(node);
  const h = hash(node.id);
  const hasCreated = variantCount > 0 || h % 2 === 0;
  const unpublishDate = h % 5 === 0 ? sampleDate(node.id, 7) : null;
  return {
    id: node.id,
    slug: node.label,
    depth,
    groupId,
    parentId,
    hasChildren: pageChildCount(node) > 0,
    childCount: pageChildCount(node),
    variantCount,
    status: variantCount > 0 || h % 3 === 0 ? "Published" : "Draft",
    protect: h % 3 === 0,
    visibility: h % 4 === 0 ? "Hidden" : "Visible",
    unpublishDate,
    created: hasCreated ? sampleDate(node.id, 1) : "—",
    modified: hasCreated ? sampleModified(node.id) : "—",
    unpublishAt: unpublishDate ? sampleDateTs(unpublishDate) : null,
    createdAt: hasCreated ? sampleDateTs(sampleDate(node.id, 1)) : null,
    modifiedAt: hasCreated ? SAMPLE_NOW - sampleModifiedAgo(node.id).hours * 3600_000 : null,
  };
}

// Flattens a collection tree into ordered slug rows. Only page nodes become
// rows; variant nodes are summarised via variantCount on their parent page row.
// Defaults to the Pages tree so existing callers are unaffected.
export function buildSlugRows(context: BrowseContext = "page"): SlugRow[] {
  const rows: SlugRow[] = [];
  const walk = (nodes: TreeNode[], depth: number, groupId: string, parentId: string | null) => {
    for (const node of nodes) {
      if (node.type === "variant") continue;
      const gid = depth === 0 ? node.id : groupId;
      rows.push(toSlugRow(node, depth, gid, parentId));
      if (node.children) walk(node.children, depth + 1, gid, node.id);
    }
  };
  walk(treeFor(context), 0, "", null);
  return rows;
}

// Look up a single page/widget node (for the Variants view header + breadcrumb).
export function findPageNode(
  id: string,
  context: BrowseContext = "page"
): TreeNode | null {
  let found: TreeNode | null = null;
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.id === id) found = node;
      if (node.children) walk(node.children);
    }
  };
  walk(treeFor(context));
  return found;
}

// --- Variant rows (Variants level) -----------------------------------------
export interface VariantRow {
  id: string;
  name: string;
  qaStatus: "Approved" | "In review" | "—";
  optimizely: boolean;
  published: boolean;
  // Scheduled release and un-publish days; the scheduled day is always before
  // the un-publish day (enforced by the variant table's date pickers).
  scheduledAt: Date | null;
  unpublishedAt: Date | null;
  created: string;
  lastModified: string;
  lastModifiedBy: string;
}

function toVariantRow(node: TreeNode): VariantRow {
  const h = hash(node.id);
  const known = !!VARIANTS[node.id];
  const scheduledAt = h % 6 === 0 ? parseSampleDay(sampleDate(node.id, 11)) : null;
  const sampleUnpublish = h % 8 === 0 ? parseSampleDay(sampleDate(node.id, 13)) : null;
  // Keep sample data valid: a scheduled release comes before its un-publish day.
  const unpublishedAt =
    scheduledAt && sampleUnpublish && dayKey(sampleUnpublish) <= dayKey(scheduledAt)
      ? addDays(scheduledAt, 14)
      : sampleUnpublish;
  return {
    id: node.id,
    name: node.label,
    qaStatus: h % 3 === 0 ? "Approved" : h % 3 === 1 ? "In review" : "—",
    optimizely: h % 2 === 0,
    published: h % 4 === 0,
    scheduledAt,
    unpublishedAt,
    created: sampleDate(node.id, 2),
    lastModified: known ? sampleModified(node.id) : sampleDate(node.id, 3),
    lastModifiedBy: EDITORS[h % EDITORS.length],
  };
}

// All variant rows owned by a given page/widget node.
export function buildVariantRows(
  pageId: string,
  context: BrowseContext = "page"
): VariantRow[] {
  const page = findPageNode(pageId, context);
  if (!page) return [];
  return (page.children ?? [])
    .filter((c) => c.type === "variant")
    .map(toVariantRow);
}

// --- Widget rows (single inline-expandable list) ---------------------------
// Real Iceberg's Widgets screen is ONE list: each widget slug expands inline to
// reveal the entries it owns (rendered under a "Pages:" label), rather than
// navigating to a separate page. We mirror that UX here by surfacing each
// widget slug together with its existing config children (reusing the current
// data — no new "pages-under-widget" relationship). Clicking a child opens the
// editor.
export interface WidgetChildRow {
  id: string;
  name: string;
  status: PageStatus;
}

// Widget Type — a scannability grouping derived PURELY from the slug (no new
// data-model field). Lets the Widgets list collapse 20+ mixed widgets into a
// handful of recognisable families so authors find the one they want fast.
export type WidgetType =
  | "Retention"
  | "Plan Picker"
  | "Promotions"
  | "Banner"
  | "Media"
  | "SEO"
  | "Legal"
  | "Other";

// Display + grouping order. Retention is pinned first (the most-used, most
// complex widget), then the higher-volume Plan Picker family, then the rest;
// "Other" always sorts last.
export const WIDGET_TYPE_ORDER: WidgetType[] = [
  "Retention",
  "Plan Picker",
  "Promotions",
  "Banner",
  "Media",
  "SEO",
  "Legal",
  "Other",
];

// Slug → Type rules, evaluated in priority order (first match wins). More
// specific render kinds (Banner) sit above broader ones (Promotions) so a
// "discount-banner" lands in Banner, not Promotions.
const WIDGET_TYPE_RULES: { type: WidgetType; test: RegExp }[] = [
  { type: "Retention", test: /retention/ },
  { type: "Plan Picker", test: /plan-picker/ },
  { type: "Banner", test: /banner/ },
  { type: "Promotions", test: /promotion|discount/ },
  { type: "SEO", test: /seo|robots/ },
  { type: "Legal", test: /legal/ },
  { type: "Media", test: /image|trailer|rail/ },
];

// Classify a widget slug into its Type. Falls back to "Other".
export function classifyWidget(slug: string): WidgetType {
  const s = slug.toLowerCase();
  for (const r of WIDGET_TYPE_RULES) if (r.test.test(s)) return r.type;
  return "Other";
}

// Type-family wayfinding hue — the single source of truth shared by browse
// group headers (Pages + Widgets: accent bar + count pill + row dot) and the
// widget editor (offer-tree groups + Segmentation offer-type rows). `fam` is
// the solid marker hue; `tint`/`ink` are the AA-safe pill pairing. Retention
// keeps Iceberg Blue as the pinned primary family. These stay scoped to browse
// grouping and never become a second chrome accent.
export const WIDGET_FAMILY_HUE: Record<
  WidgetType,
  { fam: string; tint: string; ink: string }
> = {
  Retention: { fam: "#2563eb", tint: "#eff4ff", ink: "#1e40af" },
  "Plan Picker": { fam: "#7c3aed", tint: "#f4effe", ink: "#5b21b6" },
  Promotions: { fam: "#e11d64", tint: "#fdeff4", ink: "#9f1244" },
  Banner: { fam: "#d97706", tint: "#fdf4e7", ink: "#92500e" },
  Media: { fam: "#0d9488", tint: "#e7f6f4", ink: "#0f766e" },
  SEO: { fam: "#0891b2", tint: "#e6f6fb", ink: "#155e75" },
  Legal: { fam: "#475569", tint: "#eef1f5", ink: "#334155" },
  Other: { fam: "#94a3b8", tint: "#f1f3f5", ink: "#52555c" },
};

export type GroupSwatchId =
  | "blue"
  | "violet"
  | "magenta"
  | "amber"
  | "teal"
  | "cyan"
  | "slate"
  | "gray";

export interface GroupSwatch {
  id: GroupSwatchId;
  label: string;
  fam: string;
  tint: string;
  ink: string;
}

/** Author-pickable wayfinding palette — same hues as widget families. */
export const GROUP_SWATCHES: GroupSwatch[] = [
  { id: "blue", label: "Blue", ...WIDGET_FAMILY_HUE.Retention },
  { id: "violet", label: "Violet", ...WIDGET_FAMILY_HUE["Plan Picker"] },
  { id: "magenta", label: "Magenta", ...WIDGET_FAMILY_HUE.Promotions },
  { id: "amber", label: "Amber", ...WIDGET_FAMILY_HUE.Banner },
  { id: "teal", label: "Teal", ...WIDGET_FAMILY_HUE.Media },
  { id: "cyan", label: "Cyan", ...WIDGET_FAMILY_HUE.SEO },
  { id: "slate", label: "Slate", ...WIDGET_FAMILY_HUE.Legal },
  { id: "gray", label: "Gray", ...WIDGET_FAMILY_HUE.Other },
];

export const WIDGET_TYPE_SWATCH: Record<WidgetType, GroupSwatchId> = {
  Retention: "blue",
  "Plan Picker": "violet",
  Promotions: "magenta",
  Banner: "amber",
  Media: "teal",
  SEO: "cyan",
  Legal: "slate",
  Other: "gray",
};

export function groupSwatch(id: string): GroupSwatch {
  return GROUP_SWATCHES.find((s) => s.id === id) ?? GROUP_SWATCHES[0];
}

export function groupHueVars(swatch: GroupSwatch): Record<string, string> {
  return {
    "--fam": swatch.fam,
    "--fam-tint": swatch.tint,
    "--fam-ink": swatch.ink,
  };
}

export type WidgetFormat = "HTML" | "JSON";

export interface WidgetRow {
  id: string;
  slug: string;
  type: WidgetType;
  status: PageStatus;
  /** Production `format` — HTML widgets vs JSON (plan picker / retention / SEO). */
  format: WidgetFormat;
  /** Production `widgetName` — human label shown beside the slug. */
  widgetName: string;
  created: string;
  modified: string;
  /** Sort keys (ms since epoch) for the date columns. */
  createdAt: number;
  modifiedAt: number;
  children: WidgetChildRow[];
  /** Number of production variants; a widget with variants opens its Variants list. */
  variantCount: number;
  /** Layout widgets only: the catalog layout the widget is built from. */
  layoutId: string | null;
}


// Top-level widget slugs with their inline-expandable children. Only top-level
// page nodes of WIDGETS_TREE become widget rows; their `variant` children map
// to the expandable child rows.
export function buildWidgetRows(): WidgetRow[] {
  return allWidgets().map((w) => {
    const id = productionWidgetId(w.slug);
    return {
      id,
      slug: w.slug,
      type: classifyWidget(w.slug),
      status: w.status,
      format: w.format,
      // Production leaves widgetName empty on every row of the list.
      widgetName: "",
      created: w.created,
      modified: w.modified,
      createdAt: w.createdAt,
      modifiedAt: w.modifiedAt,
      children: (PRODUCTION_WIDGET_SUBPAGES[w.slug] ?? []).map((c, i) => ({
        id: `${id}-sub-${i}`,
        name: c.name,
        status: c.status,
      })),
      variantCount: widgetVariantsFor(w.slug).length,
      layoutId: w.layoutId ?? null,
    };
  });
}

// A Type group: the family label plus the widget rows it owns.
export interface WidgetGroup {
  type: WidgetType;
  rows: WidgetRow[];
}

// Group widget rows by Type in the canonical WIDGET_TYPE_ORDER; empty groups
// are dropped so only families that actually have widgets render a header.
export function groupWidgetRows(rows: WidgetRow[]): WidgetGroup[] {
  return WIDGET_TYPE_ORDER.map((type) => ({
    type,
    rows: rows.filter((r) => r.type === type),
  })).filter((g) => g.rows.length > 0);
}

// Find the page/widget node that owns a given variant id, searching the given
// context's tree (for breadcrumbs + deep links straight to the editor).
export function findPageForVariant(
  variantId: string,
  context: BrowseContext = "page"
): TreeNode | null {
  let found: TreeNode | null = null;
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if ((node.children ?? []).some((c) => c.id === variantId && c.type === "variant")) {
        found = node;
      }
      if (node.children) walk(node.children);
    }
  };
  walk(treeFor(context));
  return found;
}

// --- Routes ----------------------------------------------------------------
// The V2 app expresses navigation as linkable hash routes so the browser back
// button works. Pages use a two-level browse-then-edit flow; Widgets are a
// single inline-expandable list (matching real Iceberg's Widgets screen):
//   #/pages                    → Pages list (default)
//   #/pages/:pageId             → Variants list for that page
//   #/widgets                   → Widgets list (rows expand inline)
//   #/widgets/:widgetId         → Variants list for that widget
//   #/content-pages             → Content Pages list (territory templates)
//   #/content-pages/:id         → Content Page editor for that template
//   #/editor/:context/:id       → the editor workspace, opened in a specific
//                                 authoring context ("page" | "widget") so the
//                                 breadcrumb + Structure tree reflect where the
//                                 author came from. A legacy 2-segment form
//                                 (#/editor/:id) is still parsed as page context.
export type V2Route =
  | { view: "home" }
  | { view: "pages" }
  | { view: "variants"; pageId: string }
  | { view: "widgets" }
  | { view: "widget-variants"; widgetId: string }
  | { view: "content-pages" }
  | { view: "content-page-editor"; pageId: string }
  | { view: "editor"; context: BrowseContext; variantId: string }
  | { view: "design-system" };

export const routes = {
  home: () => "#/home",
  pages: () => "#/pages",
  variants: (pageId: string) => `#/pages/${pageId}`,
  widgets: () => "#/widgets",
  widgetVariants: (widgetId: string) => `#/widgets/${widgetId}`,
  contentPages: () => "#/content-pages",
  contentPage: (pageId: string) => `#/content-pages/${pageId}`,
  editor: (context: BrowseContext, variantId: string) =>
    `#/editor/${context}/${variantId}`,
  designSystem: () => "#/design-system",
};

// Parse a location.hash into a V2Route. Unknown/empty → the Home dashboard (the
// landing users reach by clicking the Iceberg mark).
export function parseRoute(hash: string): V2Route {
  const clean = hash.replace(/^#\/?/, "");
  const [head, seg1, seg2] = clean.split("/");
  if (head === "home") return { view: "home" };
  if (head === "design-system") return { view: "design-system" };
  if (head === "editor" && seg1) {
    // #/editor/:context/:id when the first segment is a known context;
    // otherwise treat the legacy #/editor/:id form as page context.
    if ((seg1 === "page" || seg1 === "widget") && seg2) {
      return { view: "editor", context: seg1, variantId: seg2 };
    }
    return { view: "editor", context: "page", variantId: seg1 };
  }
  if (head === "widgets" && seg1) return { view: "widget-variants", widgetId: seg1 };
  if (head === "widgets") return { view: "widgets" };
  if (head === "content-pages" && seg1) {
    return { view: "content-page-editor", pageId: seg1 };
  }
  if (head === "content-pages") return { view: "content-pages" };
  if (head === "pages" && seg1) return { view: "variants", pageId: seg1 };
  if (head === "pages") return { view: "pages" };
  return { view: "home" };
}

export function navigate(hash: string) {
  window.location.hash = hash;
}
