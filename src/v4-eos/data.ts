// V2 workspace data model. SAMPLE DATA — representative, not a byte-for-byte
// copy of production Iceberg. Relationships modelled here:
//   Page ──contains──▶ Variant ──has──▶ Structure ─┬▶ Preview
//                                                    └▶ Properties (per object)
// The Explorer PAGES tree mixes Page rows (routes) and Variant rows (a page's
// authored experiences). Selecting a Page vs a Variant behaves differently
// (see WorkspaceShell). Structure/Preview/Properties always belong to the
// active Variant.
import { VARIANT_STRUCTURES } from "./variants";
import { placeholderVariants, withCmsPages } from "./cms-pages";
import {
  VARIANT_PREVIEWS,
  VARIANT_DEFAULT_SELECTION,
  OBJECT_PROPERTIES,
  controlSchema,
  sectionOptionsSchema,
  categorySchema,
  productSchema,
  featureSchema,
  cadenceSchema,
} from "./previews";
import { getElementDef, maxChildrenFor } from "./elements";

// Classifies a Structure object so Properties resolution and (later) drag/paste
// rules are type-aware rather than relying only on label string matching.
// Domain (architect) terminology is preferred; the older *-alias members are
// retained so the non-canonical sample Variants keep resolving unchanged.
export type StructureObjectType =
  | "page-section" // a Section (Page Title / Plan Picker / Footer / …)
  | "content-area" // Desktop Content / Mobile Content
  | "content-block" // a title/subtitle/CTA content module (Hero / Banner / FAQ …)
  | "behaviours" // Behaviours authoring area
  | "section-options" // Section Options (Custom or Intelligent)
  | "section-content" // Section Content collection
  | "variation" // Predecision / Control / Default
  | "categories" // Categories collection (architect)
  | "variant-categories" // alias: Variant Categories collection
  | "category" // Plans / Bundles
  | "products" // Products collection (architect)
  | "plan-picker-data" // alias: Plan Picker Data collection
  | "product" // a Product (Select / Premium / Premium Plus)
  | "plan" // alias: a Product
  | "product-features-list" // Product Features collection
  | "feature" // a single feature item
  | "price-cadence" // Price Cadence collection (architect)
  | "pricing" // alias: Pricing collection
  | "cadence" // a single cadence (Annual / Monthly)
  | "pricing-option" // alias: a single cadence
  // --- Widget (retention service config) domain types --------------------
  | "widget-config" // a retention widget config root
  | "journey-flows" // Journey Flows authoring area
  | "offers" // Offers collection (grouped by Offer Type)
  | "offer-group" // an Offer Type group within Offers (Retention / Cross Sell / …)
  | "offer" // a single Offer
  | "segmentation" // top-level Segmentation area (objectListDropdown analog)
  | "segmentation-group" // an Offer Type group within Segmentation
  | "segmentation-category" // a Category Title (collection of segment names)
  | "segment-names" // Segment Names collection under Segmentation
  | "segment-name" // a single Segment Name item
  | "survey-responses" // Survey Responses collection
  | "survey-response" // a single Survey Response item
  // --- Schema-driven types (built from the real layout schemas) ------------
  | "schema-fields" // a node whose panel comes verbatim from node.props
  | "schema-item" // one item of a schema collection (a tab)
  | "schema-collection"; // a `tabs` collection (add/remove items up to maxSize)

// The section-level authoring mode shown on Sections.
export type SectionDesign = "Custom" | "Intelligent authoring";

// The system/domain ROLE of a Section, distinct from its authored label.
export type SectionRole = "Page Title" | "Plan Picker" | "Footer" | (string & {});

// Generic tree node reused by both the PAGES tree and Variant Structure trees.
// Real list metadata for a page copied from production (page-inventory/pages.txt).
export interface CmsPageMeta {
  status: "Draft" | "Published";
  visibility: "Visible" | "Hidden";
  created: string | null; // display, e.g. "Jul 24 25"
  createdAt: number | null; // sort key (ms since epoch)
  modified: string | null; // relative, as the CMS shows it
  modifiedAt: number | null;
}

export interface TreeNode {
  id: string;
  label: string;
  // Present on pages that exist in production; drives the Pages list columns.
  cms?: CmsPageMeta;
  // 'page'   → a route row (rendered in mono)
  // 'variant'→ a selectable authored experience under a page
  // undefined→ a Structure object row
  type?: "page" | "variant";
  kind?: "path" | "object"; // 'path' renders in mono (page routes)
  children?: TreeNode[];
  defaultExpanded?: boolean;
  // --- Structure-object metadata (optional; drives Properties + type rules) --
  objectType?: StructureObjectType;
  sectionId?: string; // Sections only (e.g. "section-1")
  design?: SectionDesign; // Sections only
  role?: SectionRole; // Sections only — system/domain role vs authored label
  // Authored Properties payload for canonical nodes. When present it is used
  // as the element's DEFAULT resolved panel (schema + seed values), the analog
  // of an element type's schema. Per-instance edits accrue in `content`.
  props?: ResolvedProperties;
  // Instance VALUES for this element, keyed by field label — the V4 analog of
  // real Iceberg's `placeholder.content` / `section.settings`. The schema comes
  // from the element registry (by objectType); these values overlay the schema
  // defaults in both Properties and the live preview. Author edits are written
  // here (see structureOps.setNodeContent), so they persist on the instance
  // within the variant's Structure — exactly like updatePlaceholderContentByPath.
  content?: Record<string, string>;
  // Container cap (the real layout's `tabsConfig.maxSize`). Overrides the
  // objectType default so each inserted layout keeps its own limit (e.g. a
  // single-diff plan picker caps plans at 4, multi-diff at 5). Undefined ⇒ default.
  maxChildren?: number;
  // The layout schema this section was built from (schemaModel); documents the
  // real `_id` so the section can be regenerated/inspected. Sections only.
  schemaId?: string;
  // Collection item noun for a schema-collection ("Add {itemNoun}").
  itemNoun?: string;
  // Item field schema for a schema-collection — the recipe "Add {itemNoun}" uses
  // to build a fresh item (the tabs "push empty tab" analog). Raw schema fields;
  // typed loosely to avoid a schemaModel → data type cycle.
  childSchema?: unknown[];
  // Optional inline status pill shown after the row label in the Explorer tree
  // (e.g. an offer's "Live" flag §4, or a segment's Experiments mapping §11).
  badge?: string;
  badgeTone?: "success" | "warning" | "info" | "danger";
  // Structure-tree authoring state: a disabled layer is dimmed + excluded from
  // the experience but preserved (toggle via the row's Disable/Enable action).
  disabled?: boolean;
  // Page ↔ Widget link (top-level sections only). A section that references a saved
  // Widget carries that widget's slug and shows its content. Overriding it on the
  // page sets `moduleDetached` (a local override, see page-modules.ts).
  widgetSlug?: string;
  moduleDetached?: boolean;
  // Top-level section copied from a page template (a layout, not a widget). Editing
  // it sets `moduleDetached` so the page reads as a custom page.
  fromTemplate?: boolean;
}

// A Structure node is just a TreeNode (no page/variant type).
export type StructureNode = TreeNode;

export interface PreviewData {
  title: string;
  subtitle: string;
  tone: "plans" | "error" | "neutral";
  body: string;
}

export interface VariantWorkspace {
  id: string;
  name: string;
  structure: StructureNode[];
  previewData: PreviewData;
  defaultSelectionId: string; // default selected Structure object
  // The Page Template this page was built from (page-modules.ts). Undefined for
  // pages that were not built from a template.
  templateId?: string;
  // Version of the template the page was created from (origin only).
  templateVersion?: number;
}

// --- App Navigation (existing Iceberg IA; do not redesign) ------------------
// The active major authoring context. Selecting it in App Nav swaps the dataset
// loaded into Explorer / Structure / Live Preview / Properties. The four-region
// architecture itself never changes.
export type AuthoringContext = "page" | "widget";
export type NavDestination = AuthoringContext | "contentPage";

// V2-local App Nav model. Pages, Widgets, and Content Pages are actionable.
// The remaining items mirror the Iceberg IA but stay inert for now.
export interface AppNavItem {
  id: string;
  label: string; // tooltip / aria-label / visible rail label
  context?: NavDestination; // present ⇒ actionable
}

export const V2_APP_NAV: AppNavItem[] = [
  { id: "nav-pages", label: "Pages", context: "page" },
  { id: "nav-widgets", label: "Widgets", context: "widget" },
  { id: "nav-content-pages", label: "Content Pages", context: "contentPage" },
  { id: "nav-event-pages", label: "Event Pages" },
  { id: "nav-central-mgmt", label: "Central Mgmt" },
  { id: "nav-qa-queue", label: "QA Queue" },
  { id: "nav-experiments", label: "Experiments" },
  { id: "nav-scheduled-pages", label: "Scheduled Pages" },
  { id: "nav-redirects", label: "Redirects" },
  { id: "nav-services-cms", label: "Services CMS" },
  { id: "nav-help", label: "Help" },
];

// --- Explorer: PAGES --------------------------------------------------------
// Leaf pages own Variants (type: "variant"); intermediate routes are Pages.
const HAND_PAGES_TREE: TreeNode[] = [
  {
    id: "plans",
    label: "/plans",
    type: "page",
    kind: "path",
    defaultExpanded: true,
    children: [
      {
        id: "plans-all-monthly",
        label: "/plans/all-monthly",
        type: "page",
        kind: "path",
        defaultExpanded: true,
        children: [
          { id: "pg-spanish", label: "Spanish voucher error message", type: "variant" },
          { id: "pg-disclaimer2", label: "Testing disclaimer 2", type: "variant" },
          { id: "pg-annual", label: "Annual Select Update", type: "variant" },
          { id: "pg-0609", label: "0609 premium card test 2", type: "variant" },
          { id: "pg-premium-test-2", label: "Premium_Test__2", type: "variant" },
        ],
      },
      { id: "plans-brandttv", label: "/plans/brandt-tv-and-streamly", type: "page", kind: "path" },
      { id: "plans-subscribe", label: "/plans/subscribe", type: "page", kind: "path" },
      { id: "plans-testing", label: "/plans/testing-variant", type: "page", kind: "path" },
    ],
  },
  { id: "faqs", label: "/faqs", type: "page", kind: "path", children: [] },
  {
    id: "offer",
    label: "/offer",
    type: "page",
    kind: "path",
    children: [
      { id: "offer-brandn", label: "/offer/brandn", type: "page", kind: "path" },
      { id: "offer-brandn-2mo", label: "/offer/brandn-2-months", type: "page", kind: "path" },
      { id: "offer-bravo", label: "/offer/bravo-insider-offer", type: "page", kind: "path" },
      { id: "offer-dish", label: "/offer/dish", type: "page", kind: "path" },
      { id: "offer-deportes", label: "/offer/deportes", type: "page", kind: "path" },
      { id: "offer-wof", label: "/offer/wheeloffortune", type: "page", kind: "path" },
      { id: "offer-livemaslive", label: "/offer/livemaslive", type: "page", kind: "path" },
      { id: "offer-premierleague", label: "/offer/premierleague", type: "page", kind: "path" },
      { id: "offer-brandg1", label: "/offer/brandgoffer1", type: "page", kind: "path" },
      { id: "offer-cox", label: "/offer/cox-customer-offer", type: "page", kind: "path" },
      { id: "offer-streamly-2024", label: "/offer/streamly-2024", type: "page", kind: "path" },
    ],
  },
  {
    id: "brando",
    label: "/brando",
    type: "page",
    kind: "path",
    children: [
      { id: "brando-limit", label: "/brando/limit", type: "page", kind: "path" },
    ],
  },
  {
    id: "offer-terms",
    label: "/offer-terms",
    type: "page",
    kind: "path",
    children: [
      { id: "ot-brandn", label: "/offer-terms/brandn", type: "page", kind: "path" },
      { id: "ot-medical", label: "/offer-terms/medical-first-responder", type: "page", kind: "path" },
      { id: "ot-copamundial", label: "/offer-terms/copamundialannual", type: "page", kind: "path" },
      { id: "ot-crossgrade", label: "/offer-terms/crossgradegeneral", type: "page", kind: "path" },
      { id: "ot-teacher", label: "/offer-terms/teacher", type: "page", kind: "path" },
      { id: "ot-military", label: "/offer-terms/military", type: "page", kind: "path" },
      { id: "ot-student", label: "/offer-terms/student", type: "page", kind: "path" },
      { id: "ot-special", label: "/offer-terms/specialoffer", type: "page", kind: "path" },
      { id: "ot-select-annual", label: "/offer-terms/select-annual", type: "page", kind: "path" },
      { id: "ot-premiumupgrade", label: "/offer-terms/premiumupgrade", type: "page", kind: "path" },
      { id: "ot-marea", label: "/offer-terms/marea", type: "page", kind: "path" },
      { id: "ot-care", label: "/offer-terms/care", type: "page", kind: "path" },
      { id: "ot-adsales", label: "/offer-terms/adsales", type: "page", kind: "path" },
    ],
  },
  { id: "news", label: "/news", type: "page", kind: "path", children: [] },
  {
    id: "sports",
    label: "/sports",
    type: "page",
    kind: "path",
    children: [{ id: "sports-template", label: "Sports", type: "variant" }],
  },
  { id: "test", label: "/test", type: "page", kind: "path", children: [] },
  { id: "stream-movies", label: "/stream-movies", type: "page", kind: "path", children: [] },
];

// Production page inventory merged in (see cms-pages.ts).
export const PAGES_TREE: TreeNode[] = withCmsPages(HAND_PAGES_TREE);

// Default: no page/variant preselected route, but open on the richest variant
// so first paint shows a populated workspace.
export const DEFAULT_VARIANT_ID = "pg-0609"; // "0609 premium card test 2"

// --- Explorer: WIDGETS ------------------------------------------------------
// Widget context mirrors the Page shape at a smaller scale: a route tree whose
// leaves are configs (type: "variant" so Explorer treats them as selectable
// authored experiences), each config owning a Structure. This keeps the same
// Explorer/Structure/Preview/Properties machinery; only the dataset differs.
export const WIDGETS_TREE: TreeNode[] = [
  {
    id: "wg-what-is-streamly",
    label: "/what-is-streamly",
    type: "page",
    kind: "path",
    defaultExpanded: true,
    children: [
      { id: "wg-wip-punky", label: "stream-tv/punky-brewster -- 2.2", type: "variant" },
      { id: "wg-wip-blackboys", label: "stream-movies/black-boys -- 1.27 new url", type: "variant" },
      { id: "wg-wip-hitmen", label: "hitmen -- 7.21 updated_compressed_images", type: "variant" },
      { id: "wg-wip-brave", label: "brave-new-world -- 8.16 Evergreen Trailer Uploaded", type: "variant" },
      { id: "wg-wip-saved", label: "saved-by-the-bell -- 9.29 - AS", type: "variant" },
      { id: "wg-wip-babyboss", label: "stream-movies/boss-baby-2 -- 5.24 - launch (no index)", type: "variant" },
      { id: "wg-wip-miley", label: "stream-tv/miley-cyrus-presents-stand-by-you -- 6.16", type: "variant" },
      { id: "wg-wip-mrmercedes", label: "stream-tv/mr-mercedes -- 6.30 SEO Test", type: "variant" },
      { id: "wg-wip-manifest", label: "stream-tv/manifest -- 6.24 - remove free trial", type: "variant" },
      { id: "wg-wip-olympic", label: "stream-tv/olympic-highlights-kevin-hart-snoop-dogg -- 7.22 announcement", type: "variant" },
      { id: "wg-wip-trailerrail", label: "stream-tv/agt-americas-wildcard -- 8.10 launch", type: "variant" },
      { id: "wg-wip-labrea", label: "stream-tv/la-brea -- 9.12 - FINAL + indexed", type: "variant" },
      { id: "wg-wip-snl", label: "stream-tv/saturday-night-live -- 11.16 - Ep count updates", type: "variant" },
      { id: "wg-wip-collections", label: "collections -- 7.1 - July Refresh", type: "variant" },
      { id: "wg-wip-fivebedrooms", label: "stream-tv/five-bedrooms -- 8.5 - S2 AS", type: "variant" },
    ],
  },
  {
    id: "wg-seo-footer",
    label: "/seo-footer",
    type: "page",
    kind: "path",
    children: [
      { id: "wg-sf-pl-0715-01", label: "premierleague -- 20200715-01", type: "variant" },
      { id: "wg-sf-upgrade-0716-01", label: "upgrade -- 20200716-01", type: "variant" },
      { id: "wg-sf-pl-0716-03", label: "premierleague -- 20200716-03", type: "variant" },
      { id: "wg-sf-pl-current", label: "premierleague -- current-pl-ui-image", type: "variant" },
      { id: "wg-sf-upgrade-0716-03r", label: "upgrade -- 20200716-03-redirect", type: "variant" },
      { id: "wg-sf-pl-0715-02", label: "premierleague -- 20200715-02", type: "variant" },
      { id: "wg-sf-pl-0720-01", label: "premierleague -- 20200720-01", type: "variant" },
      { id: "wg-sf-home-prev", label: "home -- prev-published 1-1", type: "variant" },
      { id: "wg-sf-blackboys", label: "stream-movies/black-boys -- 1.27 new url", type: "variant" },
      { id: "wg-sf-lacrosse", label: "sports/premier-lacrosse-league -- publish", type: "variant" },
    ],
  },
  { id: "wg-pp-spanish-sports", label: "/plan-picker-spanish-sports", type: "page", kind: "path", children: [] },
  { id: "wg-remote-feature-flags", label: "/remote-feature-flags", type: "page", kind: "path", children: [] },
  { id: "wg-pp-partner", label: "/plan-picker-partner", type: "page", kind: "path", children: [] },
  { id: "wg-cp-pp-no-select", label: "/content-pages-plan-picker-no-select", type: "page", kind: "path", children: [] },
  { id: "wg-sports-premium-pp", label: "/sports-premium-plan-picker", type: "page", kind: "path", children: [] },
  { id: "wg-commerce-pp-premium", label: "/commerce-plan-picker-premium", type: "page", kind: "path", children: [] },
  { id: "wg-pp-copy-dr", label: "/plan-picker-copy-dr", type: "page", kind: "path", children: [] },
  { id: "wg-cp-pp-with-select", label: "/content-pages-plan-picker-with-select", type: "page", kind: "path", children: [] },
  { id: "wg-pp-select-sitewide", label: "/plan-picker-select-sitewide", type: "page", kind: "path", children: [] },
  { id: "wg-generic-student-banner", label: "/generic-student-discount-banner", type: "page", kind: "path", children: [] },
  { id: "wg-custom-robots-txt", label: "/custom-robots-txt", type: "page", kind: "path", children: [] },
  { id: "wg-qa-image-widget", label: "/qa-image-widget", type: "page", kind: "path", children: [] },
  { id: "wg-qa-bff-legal-bit", label: "/qa-sas-bff-smoke-legal-bit", type: "page", kind: "path", children: [] },
  { id: "wg-qa-bff-image", label: "/qa-sas-bff-smoke-image", type: "page", kind: "path", children: [] },
  { id: "wg-sports-offering-new", label: "/sports-offering-module-new", type: "page", kind: "path", children: [] },
  { id: "wg-qa-eng-legal-bit", label: "/qa-widget-eng-the-legal-bit", type: "page", kind: "path", children: [] },
  { id: "wg-trailer-rail", label: "/trailer-rail", type: "page", kind: "path", children: [] },
  { id: "wg-promotions-display", label: "/promotions-display-groups", type: "page", kind: "path", children: [] },
  {
    id: "wg-retention",
    label: "/retention-service-config-us",
    type: "page",
    kind: "path",
    children: [
      { id: "wg-qa-republish", label: "qa-republish-Copy of default", type: "variant" },
    ],
  },
];

// Default Widget config opened on first switch into Widget context.
export const DEFAULT_WIDGET_CONFIG_ID = "wg-qa-republish";

// --- Real Widget domain model (source of truth: src/v1 retention config) ----
// Rebuilt here as V2-native data (no import from src/v1). Structure nodes carry
// their objectType + an authored `props` payload so resolveWidgetPropertiesFor
// returns them verbatim — the same pattern canonical Page nodes use.

// Options reused across Offer / Survey Response forms. These mirror the REAL
// production Retention Service schema verbatim (elements-streamly
// retention-service/schema.ts + type.ts).
const OFFER_TYPES = ["Retention", "Cross Sell", "Downgrade", "Other"];
const SURVEY_TYPES = ["Checkbox", "Text"];
const SAVE_MOMENTS = ["Offer Save", "Content Save"];
// Product/Voucher schema-switcher (isClearable → "None").
const CODE_TYPES = ["None", "Product", "Voucher"];

// §item4 Prototype "today" — the real current date so the "Expired" cue is
// honest (an offer whose end date is in the past reads as expired here).
const TODAY_ISO = new Date().toISOString().slice(0, 10);

// §5 Human-readable plan/product each Cancellation Product Static ID maps to, so
// authors never have to decode an opaque ID by hand.
const STATIC_ID_PLAN_NAMES: Record<string, string> = {
  streamly_premium_monthly: "Premium · Monthly",
  streamly_premium_annual: "Premium · Annual",
  streamly_premium_plus_monthly: "Premium Plus · Monthly",
  streamly_premium_plus_annual: "Premium Plus · Annual",
};
const planNameForStaticId = (id: string): string =>
  STATIC_ID_PLAN_NAMES[id] ?? (id ? "Unrecognised plan ID" : "");

// §11 Whether an mParticle segment is wired to an Experiments audience (so it can
// run in experiments). Heuristic for the prototype — a real check would hit the
// Experiments mapping service — but it yields a realistic mapped/unmapped mix.
const isSegmentMappedToExperiments = (name: string): boolean =>
  !!name && !name.includes("NOOFFER") && !name.endsWith("SOLO");

// Journey Flow select options (verbatim labels from the real schema). In
// production these sit behind feature flags (default off); we surface them so
// the widget's full architecture is visible.
const RETENTION_JOURNEY_OPTIONS = [
  "Reminder > Content or Dual Plan > Content",
  "Reminder > Content or Content > Dual Plan",
  "Reminder > Help > Benefits > Content > Offer",
  "Reminder > Help > Benefits > Content > Dual Plan",
  "Reminder > Content > Dual Plan or Benefits > Content > Dual Plan",
  "Reminder > Content > Dual Plan",
];
const VIEWING_JOURNEY_OPTIONS = [
  "Reminder > Help > Benefits > Content > Offer > Downgrade Offer",
  "Reminder > Help > Benefits > Content > Dual Plan",
  "Reminder > Benefits > Dual Plan",
];
const QUICK_CANCEL_OPTIONS = ["Confirm Cancel"];
const IMMEDIATE_CANCEL_OPTIONS = ["Plan Options"];

// Real Offer segment names taken from the retention config. These seed the first
// rows so reviewers immediately recognise meaningful labels.
const REAL_SEGMENTS: string[] = [
  "US.CANCEL.40SAVED1YQ125",
  "US.CANCEL.50SAVED1YQ424",
  "US.CANCEL.60SAVED1YQ424",
  "US.CANCEL.70SAVED1YQ125",
  "US.CANCEL.299SAVED6MQ425WWE",
  "US.CANCEL.299SAVED6MQ425SOLO",
  "US.CANCEL.599SAVED6MQ425SOLO",
  "US.CANCEL.799SAVED6MQ425SOLO",
  "US.CANCEL.299SAVED6MQ425DUAL",
  "US.CANCEL.599SAVED6MQ425DUAL",
  "US.CANCEL.799SAVED6MQ425DUAL",
  "US.CANCEL.SAVECCG30D1YQ126SOLO",
  "US.CANCEL.SAVECCG50D1YQ126SOLO",
  "US.CANCEL.SAVECCG80D1YQ126SOLO",
  "US.CANCEL.SAVECCG30D1YQ126DUAL",
  "US.CANCEL.SAVECCG50D1YQ126DUAL",
  "US.CANCEL.SAVECCG80D1YQ126DUAL",
  "US.CANCEL.NOOFFER",
];

// Plain-data shape for an Offer. Kept separate from TreeNode so labels/filter
// keys can be derived without re-parsing the props payload.
interface OfferData {
  id: string;
  type: string;
  // §3 top-level band: "Retention" (cancellation saves) vs "Acquisition"
  // (partner / win-back offers, e.g. BrandM), so the two are never intermingled.
  category: string;
  // §4 the Journey Flow this offer is currently live in ("" ⇒ not live).
  liveInFlow: string;
  cancellationProductStaticId: string;
  segmentName: string;
  surveyResponseLabelKey: string;
  suppressDefaultOffer: boolean;
  // §item4 ISO yyyy-mm-dd the offer stops serving; "" ⇒ no end date. Surfaced so
  // expired offers are visible in the editor instead of silently failing in prod.
  offerEndDate: string;
  productVoucher: string;
  voucherCode: string;
  segmentation: {
    offerType: string;
    categoryTitle: string;
    segmentNames: string[];
  };
}

const makeOffer = (
  segmentName: string,
  extras: Partial<OfferData> = {}
): OfferData => ({
  id: `of-${segmentName}`,
  type: extras.type ?? "Retention",
  category: extras.category ?? "Retention",
  liveInFlow: extras.liveInFlow ?? "",
  cancellationProductStaticId:
    extras.cancellationProductStaticId ?? "streamly_premium_monthly",
  segmentName,
  surveyResponseLabelKey: extras.surveyResponseLabelKey ?? "",
  suppressDefaultOffer: extras.suppressDefaultOffer ?? false,
  offerEndDate: extras.offerEndDate ?? "",
  productVoucher: extras.productVoucher ?? "Streamly Premium",
  voucherCode: extras.voucherCode ?? segmentName.replace(/^US\.CANCEL\./, ""),
  segmentation: extras.segmentation ?? {
    offerType: "Retention",
    categoryTitle: "D2C",
    segmentNames: [],
  },
});

// Programmatically extend the real seeds up to 81 offers to demonstrate scale.
const OFFER_PATTERNS = ["SAVED1YQ", "SAVED6MQ", "SAVECCG", "WINBACK", "LOYALTY"];
const OFFER_PLANS = ["SOLO", "DUAL", "BrandW", "PREMIUM", "PLUS"];

// Distribute realistic Offer Types across the seeds so the by-type grouping is
// populated (mostly Retention, with Cross Sell / Downgrade / Other mixed in).
// Grouping-by-type is a scannability enhancement (the real offerMappings list is
// flat, keyed off each offer's `type`).
const OFFER_TYPE_BY_INDEX = (i: number): string => {
  const r = i % 7;
  if (r === 2 || r === 5) return "Cross Sell";
  if (r === 3) return "Downgrade";
  if (r === 6) return "Other";
  return "Retention";
};

const buildOffers = (): OfferData[] => {
  const offers = REAL_SEGMENTS.map((s, i) =>
    makeOffer(s, { type: OFFER_TYPE_BY_INDEX(i) }),
  );
  // Deep nested example on the first offer.
  offers[0].segmentation.segmentNames = [
    "US.CANCEL.40SAVED1YQ125",
    "US.CANCEL.50SAVED1YQ424",
    "US.CANCEL.60SAVED1YQ424",
    "US.CANCEL.70SAVED1YQ125",
  ];
  offers[0].surveyResponseLabelKey = "retention.survey.response.id.1";
  // A second, smaller nested example.
  offers[4].segmentation.segmentNames = [
    "US.CANCEL.299SAVED6MQ425WWE",
    "US.CANCEL.299SAVED6MQ425SOLO",
  ];
  // §4 mark a few offers as live in a Journey Flow so the "Live" cue and the
  // read-only STATUS panel have real values to show (others stay "Not live").
  offers[0].liveInFlow = "Cancel Save";
  offers[1].liveInFlow = "Cancel Save";
  offers[4].liveInFlow = "BrandW Win-back";
  // §item4 seed end dates: one already lapsed (Expired cue), two upcoming, so the
  // STATUS badge and the Offer End Date field have real values to demonstrate.
  offers[0].offerEndDate = "2025-12-31";
  offers[1].offerEndDate = "2026-12-31";
  offers[4].offerEndDate = "2026-10-15";
  // The NOOFFER row suppresses the default offer.
  const noOffer = offers.find((o) => o.segmentName.endsWith("NOOFFER"));
  if (noOffer) noOffer.suppressDefaultOffer = true;

  for (let i = offers.length; i < 81; i++) {
    const price = 199 + (i % 8) * 100;
    const pattern = OFFER_PATTERNS[i % OFFER_PATTERNS.length];
    const plan = OFFER_PLANS[i % OFFER_PLANS.length];
    offers.push(
      makeOffer(`US.CANCEL.${price}${pattern}${(i % 12) + 1}${plan}`, {
        type: OFFER_TYPE_BY_INDEX(i),
      }),
    );
  }
  // §3 Acquisition band: partner / win-back offers (e.g. BrandM) authored in a
  // clearly separate band from cancellation-save (Retention) offers.
  offers.push(
    makeOffer("US.ACQ.BRANDM.TRUEBLUE12M", {
      type: "Cross Sell",
      category: "Acquisition",
      cancellationProductStaticId: "streamly_premium_annual",
      productVoucher: "Streamly Premium",
      liveInFlow: "BrandM Partner",
      segmentation: { offerType: "Acquisition", categoryTitle: "BrandM", segmentNames: [] },
    }),
    makeOffer("US.ACQ.BRANDM.MOSAIC6M", {
      type: "Cross Sell",
      category: "Acquisition",
      cancellationProductStaticId: "streamly_premium_plus_annual",
      productVoucher: "Streamly Premium Plus",
      segmentation: { offerType: "Acquisition", categoryTitle: "BrandM", segmentNames: [] },
    }),
    makeOffer("US.ACQ.WINBACK.30D", {
      type: "Other",
      category: "Acquisition",
      cancellationProductStaticId: "streamly_premium_monthly",
      liveInFlow: "Win-back",
      segmentation: { offerType: "Acquisition", categoryTitle: "Win-back", segmentNames: [] },
    }),
  );
  return offers;
};

// Plain-data shape for a Survey Response.
interface SurveyResponseData {
  id: string;
  responseId: string;
  displayLabel: string;
  displayOrder: string;
  type: string;
  saveMoment: string;
  savePriority: string;
}

const SURVEY_LABELS = [
  "Too expensive",
  "Not watching enough",
  "Technical issues",
  "Found a better service",
  "Only wanted one show",
  "Content not available",
  "Temporary break",
  "Other",
];

const buildSurveyResponses = (): SurveyResponseData[] =>
  SURVEY_LABELS.map((displayLabel, i) => {
    const n = i + 1;
    return {
      id: `sr-${n}`,
      responseId: `retention.survey.response.id.${n}`,
      displayLabel,
      displayOrder: String(n),
      type: "Checkbox",
      saveMoment: "Offer Save",
      savePriority: String(n),
    };
  });

// --- Structure-node builders: attach objectType + authored props payload -----

const segmentNameNode = (
  keyPrefix: string,
  name: string,
  i: number,
): StructureNode => {
  const mapped = isSegmentMappedToExperiments(name);
  return {
    id: `${keyPrefix}-seg-${i}`,
    label: name || `Segment ${i + 1}`,
    objectType: "segment-name",
    // §11 surface Experiments-mapping readiness inline in the tree.
    badge: name ? (mapped ? "Mapped" : "Unmapped") : undefined,
    badgeTone: mapped ? "success" : "warning",
    props: {
      kind: "fields",
      data: {
        eyebrow: "SEGMENT NAME",
        name: name || `Segment ${i + 1}`,
        fields: [
          {
            label: "Segment Name",
            value: name,
            tooltip:
              "The mParticle audience key. Must match the segment configured in mParticle exactly.",
          },
          {
            label: "Experiments mapping",
            value: mapped
              ? "Mapped ✓"
              : "Unmapped — will not run in A/B tests",
            tooltip:
              "Whether this mParticle segment is wired to an Experiments audience. Unmapped segments are skipped by experiments.",
          },
        ],
      },
    },
  };
};

// --- Offer (a single offerMappings tab) -------------------------------------
// Field order/labels/controls mirror the real Streamly retention schema exactly:
//   Type (select, required) → IF CUSTOMER IS CANCELLING: Cancellation Product
//   Static ID (required) → AND: Segment Name (Optional) → AND: Survey Response
//   Label Key (Optional) → THEN SHOW: Suppress default offer (toggle) +
//   Product/Voucher (schema-switcher → Code).
const offerNode = (offer: OfferData): StructureNode => {
  const codeType = offer.voucherCode ? "Voucher" : offer.productVoucher ? "Product" : "None";
  const code = codeType === "Voucher" ? offer.voucherCode : offer.productVoucher;
  const planName = planNameForStaticId(offer.cancellationProductStaticId);
  const isRetentionType = offer.type === "Retention";
  // §item4 ISO date strings sort lexicographically, so a plain string compare is
  // a correct "end date is before today" test.
  const isExpired = offer.offerEndDate !== "" && offer.offerEndDate < TODAY_ISO;
  const groups: PropertyGroup[] = [
    // §4/§3 read-only context so authors instantly see where the offer runs and
    // which band it belongs to, without opening Journey Flows.
    {
      header: "STATUS",
      fields: [
        {
          label: "Live in flow",
          value: offer.liveInFlow || "Not live",
          tooltip:
            "The Journey Flow this offer is currently served in. Managed under Journey Flows.",
        },
        { label: "Band", value: `${offer.category} offer` },
        {
          label: "Offer End Date",
          value: offer.offerEndDate,
          // §item4 authored date the offer stops serving; empty ⇒ open-ended.
          helper: offer.offerEndDate
            ? isExpired
              ? "This end date has already passed."
              : "Date this offer stops serving."
            : "No end date — serves until removed.",
          tooltip:
            "Set an end date so lapsed offers show as Expired here instead of silently failing in production. Format: YYYY-MM-DD.",
        },
        // §item4 explicit Expired badge when the authored end date is in the past.
        ...(isExpired
          ? ([
              {
                label: "Status",
                value: "",
                badge: "Expired",
                badgeTone: "destructive",
                tooltip:
                  "This offer's end date is in the past, so it no longer serves in production.",
              },
            ] as PropertyField[])
          : []),
      ],
    },
    {
      fields: [
        {
          label: "Type",
          value: offer.type,
          kind: "select",
          options: OFFER_TYPES,
          required: true,
          tooltip:
            "Retention saves incentivise cancelling customers to stay. Cross Sell / Downgrade / Other tailor the flow.",
        },
      ],
    },
    {
      header: "IF CUSTOMER IS CANCELLING",
      fields: [
        {
          label: "Cancellation Product Static ID",
          value: offer.cancellationProductStaticId,
          required: true,
          tooltip:
            "The subscription product this offer applies to. Copy the Static ID from Central Management.",
          // §5 decode the opaque ID to the plan/product it maps to.
          helper: planName ? `Maps to: ${planName}` : undefined,
        },
      ],
    },
    {
      header: "AND",
      fields: [
        {
          label: "Segment Name (Optional)",
          value: offer.segmentName,
          tooltip:
            "The mParticle audience this offer targets. Leave blank to apply to every cancelling customer on the plan above.",
        },
      ],
    },
  ];
  // §12 Survey Response routing is irrelevant for a straight Retention save, so
  // hide the field for Retention offers (it stays for Cross Sell / Downgrade / …).
  if (!isRetentionType) {
    groups.push({
      header: "AND",
      fields: [
        {
          label: "Survey Response Label Key (Optional)",
          value: offer.surveyResponseLabelKey,
          helper: "e.g. retention.survey.response.id.1",
          tooltip:
            "Links this offer to a cancellation-survey answer so it only shows to customers who chose that reason.",
        },
      ],
    });
  }
  groups.push({
    header: "THEN SHOW",
    fields: [
      {
        label: "Suppress default offer",
        value: offer.suppressDefaultOffer ? "true" : "false",
        kind: "switch",
        tooltip:
          "When on, this offer replaces the widget's default offer for the matched segment.",
      },
      {
        label: "Product / Voucher",
        value: codeType,
        kind: "select",
        options: CODE_TYPES,
        tooltip:
          "Whether the incentive is a Product (plan swap) or a Voucher (discount code).",
      },
      {
        label: codeType === "Voucher" ? "Voucher Code" : "Product Static ID",
        value: codeType === "None" ? "" : code,
        // §item3 relabel/hide live from the sibling "Product / Voucher" select so
        // the field tracks edits (Voucher ⇒ Voucher Code, Product ⇒ Product
        // Static ID, None ⇒ hidden) instead of only reflecting the seed at build.
        dependsOn: {
          field: "Product / Voucher",
          labelMap: { Voucher: "Voucher Code", Product: "Product Static ID" },
          hideWhen: ["None"],
        },
        tooltip:
          "The identifier served for this offer — a Voucher Code for a discount, or a Product Static ID for a plan swap.",
      },
    ],
  });
  // §item6 Anna: segmentation is easier to manage in one view with the offer, so
  // surface this offer's segmentation inline — not only in the Segmentation area.
  const seg = offer.segmentation;
  const segCount = seg.segmentNames.length;
  groups.push({
    header: "SEGMENTATION",
    fields: [
      {
        label: "Offer Type",
        value: seg.offerType,
        tooltip:
          "The segmentation family this offer belongs to — shown here so targeting lives beside the offer, not in a separate tab.",
      },
      {
        label: "Category Title",
        value: seg.categoryTitle,
        tooltip:
          "The segmentation category (e.g. D2C, BrandM) this offer is filed under.",
      },
      {
        label: "Segment Names",
        value: seg.segmentNames.join("\n"),
        kind: "textarea",
        helper: segCount
          ? `${segCount} prioritised segment${segCount === 1 ? "" : "s"} · one per line`
          : "No additional segments — applies to the plan/segment above.",
        tooltip: "The mParticle audiences this offer is prioritised for.",
      },
    ],
  });
  return {
    id: offer.id,
    label: offer.segmentName || offer.voucherCode || offer.id,
    objectType: "offer",
    // §4 inline "Live" cue on the row when the offer is served in a flow.
    badge: offer.liveInFlow ? "Live" : undefined,
    badgeTone: offer.liveInFlow ? "success" : undefined,
    props: {
      kind: "fields",
      data: {
        eyebrow: "OFFER",
        name: offer.segmentName || offer.voucherCode,
        groups,
      },
    },
  };
};

const surveyResponseNode = (sr: SurveyResponseData): StructureNode => ({
  id: sr.id,
  label: sr.displayLabel || sr.responseId,
  objectType: "survey-response",
  props: {
    kind: "fields",
    data: {
      eyebrow: "SURVEY RESPONSE",
      name: sr.displayLabel || sr.responseId,
      fields: [
        {
          label: "ID",
          value: sr.responseId,
          tooltip:
            "The stable key an offer references (surveyResponseLabelKey) to bind to this answer.",
        },
        {
          label: "Display Label",
          value: sr.displayLabel,
          tooltip: "The human-readable cancellation reason shown to customers.",
        },
        {
          label: "Display Order",
          value: sr.displayOrder,
          tooltip: "Position of this answer in the survey list (lower shows first).",
        },
        { label: "Type", value: sr.type, kind: "select", options: SURVEY_TYPES },
        {
          label: "Save Moment",
          value: sr.saveMoment,
          kind: "select",
          options: SAVE_MOMENTS,
          tooltip: "When the response is persisted — on offer save or on content save.",
        },
        { label: "Save Priority", value: sr.savePriority },
      ],
    },
  },
});

// --- Segmentation (top-level objectListDropdown analog) ---------------------
// segmentPriority[offerType][categoryTitle] = string[]. Represented as:
//   Segmentation → Offer Type group → Category Title (collection) → Segment Name
const segmentCategoryNode = (
  groupId: string,
  title: string,
  names: string[],
): StructureNode => {
  const children = names.map((n, i) => segmentNameNode(`${groupId}-${title}`, n, i));
  return {
    id: `${groupId}-cat-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: title,
    // Collection panel resolves live from children (registry) so add/remove of
    // segment names reflects immediately.
    objectType: "segmentation-category",
    children,
  };
};

const segmentationGroupNode = (
  offerType: string,
  categories: { title: string; names: string[] }[],
): StructureNode => {
  const groupId = `wg-seg-${offerType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const children = categories.map((c) => segmentCategoryNode(groupId, c.title, c.names));
  return {
    id: groupId,
    label: offerType,
    objectType: "segmentation-group",
    children,
  };
};

// Seed segmentation from the real nested examples that previously lived on
// individual offers, now organised at the section level by Offer Type.
const buildSegmentationArea = (): StructureNode => {
  const groups = [
    segmentationGroupNode("Retention", [
      {
        title: "D2C",
        names: [
          "US.CANCEL.40SAVED1YQ125",
          "US.CANCEL.50SAVED1YQ424",
          "US.CANCEL.60SAVED1YQ424",
          "US.CANCEL.70SAVED1YQ125",
        ],
      },
      {
        title: "BrandW",
        names: ["US.CANCEL.299SAVED6MQ425WWE", "US.CANCEL.299SAVED6MQ425SOLO"],
      },
    ]),
    segmentationGroupNode("Cross Sell", [
      { title: "SPORTS", names: ["US.CANCEL.CROSSSELL.SPORTS1"] },
    ]),
  ];
  return {
    id: "wg-segmentation",
    label: "Segmentation",
    objectType: "segmentation",
    children: groups,
  };
};

// Offers are grouped by Offer Type into collapsible groups (a scannability
// enhancement borrowed from the design prototype). Order is fixed; empty groups
// are omitted.
// §3 Offers split into two top-level bands by CATEGORY — Retention saves vs
// Acquisition/partner offers (e.g. BrandM) — so the two are never intermingled
// and can't be edited into each other by mistake. Order is fixed; empty bands
// are omitted. Each band keeps objectType "offer-group" so the Explorer's
// group-aware Offers search continues to work unchanged.
const OFFER_CATEGORY_ORDER = ["Retention", "Acquisition"];
const groupId = (category: string) =>
  `wg-offers-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const buildOfferGroups = (offers: OfferData[]): StructureNode[] =>
  OFFER_CATEGORY_ORDER.flatMap((category) => {
    const inCat = offers.filter((o) => (o.category || "Retention") === category);
    if (inCat.length === 0) return [];
    return [
      {
        id: groupId(category),
        label: `${category} Offers`,
        objectType: "offer-group",
        defaultExpanded: category === "Retention",
        children: inCat.map(offerNode),
      } satisfies StructureNode,
    ];
  });

// Assemble the canonical retention config Structure once at module load.
const RETENTION_OFFERS = buildOffers();
const RETENTION_SURVEY_RESPONSES = buildSurveyResponses();

// Widget-level settings — the real WidgetEditorMetadata "Widget Settings" +
// "Widget Preview Settings" panel. Values are representative for the prototype.
const buildWidgetSettingsNode = (): StructureNode => ({
  id: "wg-widget-settings",
  label: "Widget Settings",
  objectType: "widget-config",
  defaultExpanded: true,
  props: {
    kind: "fields",
    data: {
      eyebrow: "WIDGET SETTINGS",
      name: "Widget Settings",
      groups: [
        {
          fields: [
            { label: "Name", value: "retention-service-config-us" },
            {
              // §item1 Anna: authors should manage the widget beyond raw code.
              // "Form" (the new default) drives the widget through the guided
              // Structure/Properties forms; JSON/HTML stay for advanced edits.
              label: "Format",
              value: "Form",
              kind: "select",
              options: ["Form", "JSON", "HTML"],
              helper: "Form authoring manages this widget with guided fields — no JSON or HTML editing required.",
              tooltip:
                "Form: manage offers, segmentation and settings through the guided forms in this editor. JSON / HTML: hand-edit the raw config for advanced cases.",
            },
            {
              label: "Widget Type",
              value: "Retention Service",
              kind: "select",
              options: ["Retention Service", "Segmentation", "In App Offers"],
            },
          ],
        },
        {
          header: "OPTIONS",
          fields: [
            { label: "Post to Slack on Publish", value: "false", kind: "switch" },
            { label: "No content wrapper", value: "false", kind: "switch" },
            { label: "Protected", value: "false", kind: "switch" },
            { label: "Secure", value: "false", kind: "switch" },
            { label: "Lock JSON editor", value: "false", kind: "switch" },
          ],
        },
      ],
    },
  },
});

const buildRetentionStructure = (): StructureNode[] => {
  const surveyNodes = RETENTION_SURVEY_RESPONSES.map(surveyResponseNode);
  return [
    // Widget Settings: the real widget metadata panel (Name / Format / Type +
    // publish/security toggles). Sits at the top like the design prototype.
    buildWidgetSettingsNode(),
    // Journey Flows: four real select fields (verbatim options). In production
    // these sit behind feature flags; surfaced here to show the full shape.
    {
      id: "wg-journey-flows",
      label: "Journey Flows",
      objectType: "journey-flows",
      defaultExpanded: true,
      props: {
        kind: "fields",
        data: {
          eyebrow: "JOURNEY FLOWS",
          name: "Journey Flows",
          fields: [
            {
              label: "Select Retention Journey Flow",
              value: RETENTION_JOURNEY_OPTIONS[0],
              kind: "select",
              options: RETENTION_JOURNEY_OPTIONS,
              required: true,
            },
            {
              label: "Select Viewing Experience Journey",
              value: VIEWING_JOURNEY_OPTIONS[0],
              kind: "select",
              options: VIEWING_JOURNEY_OPTIONS,
            },
            {
              label: "Select Quick Cancel Journey",
              value: QUICK_CANCEL_OPTIONS[0],
              kind: "select",
              options: QUICK_CANCEL_OPTIONS,
            },
            {
              label: "Select Immediate Cancel Journey",
              value: IMMEDIATE_CANCEL_OPTIONS[0],
              kind: "select",
              options: IMMEDIATE_CANCEL_OPTIONS,
            },
          ],
        },
      },
    },
    // Offers: grouped by Offer Type (Retention / Cross Sell / Downgrade / Other),
    // each group a collapsible collection of offers.
    {
      id: "wg-offers",
      label: "Offers",
      objectType: "offers",
      children: buildOfferGroups(RETENTION_OFFERS),
    },
    // Segmentation: top-level objectListDropdown (Offer Type → Category → names).
    buildSegmentationArea(),
    // Survey Responses: tabs collection (minSize 1).
    {
      id: "wg-survey-responses",
      label: "Survey Responses",
      objectType: "survey-responses",
      children: surveyNodes,
    },
  ];
};

// Factory for a fresh widget child when the author clicks "Add {noun}" on a
// retention collection. Returns null for non-widget types so the generic
// layouts.createChildNode handles page containers. New leaf nodes carry a
// props payload (empty schema + real dropdowns) so their panel renders like the
// seeded ones; new sub-collections start empty and resolve live from children.
let widgetChildSeq = 0;
const wuid = (p: string) => `${p}-new-${widgetChildSeq++}`;

export function createWidgetChild(
  type: StructureObjectType,
): StructureNode | null {
  switch (type) {
    case "offer-group": {
      // A fresh Offer Type group (empty); author renames + adds offers.
      return {
        id: wuid("wg-offers"),
        label: "New offer type",
        objectType: "offer-group",
        children: [],
      };
    }
    case "offer":
      return {
        ...offerNode({
          id: wuid("of"),
          type: "Retention",
          category: "Retention",
          liveInFlow: "",
          cancellationProductStaticId: "",
          segmentName: "",
          surveyResponseLabelKey: "",
          suppressDefaultOffer: false,
          offerEndDate: "",
          productVoucher: "",
          voucherCode: "",
          segmentation: { offerType: "Retention", categoryTitle: "", segmentNames: [] },
        }),
        label: "New offer",
      };
    case "survey-response":
      return surveyResponseNode({
        id: wuid("sr"),
        responseId: "",
        displayLabel: "New response",
        displayOrder: "",
        type: "Checkbox",
        saveMoment: "Offer Save",
        savePriority: "",
      });
    case "segmentation-group": {
      const n = segmentationGroupNode("Retention", []);
      return { ...n, id: wuid("wg-seg"), label: "New offer type" };
    }
    case "segmentation-category":
      return segmentCategoryNode(wuid("wg-seg"), "New category", []);
    case "segment-name":
      return segmentNameNode(wuid("seg"), "New segment", 0);
    default:
      return null;
  }
}

// Lightweight lookup for the Offers structure filter (label + filter keys),
// keyed by offer node id. Keeps filtering out of the render path.
export const WIDGET_OFFER_FILTER_INDEX: Record<
  string,
  { label: string; keys: string }
> = Object.fromEntries(
  RETENTION_OFFERS.map((o) => [
    o.id,
    {
      label: o.segmentName || o.voucherCode || o.id,
      keys: [o.segmentName, o.voucherCode, o.cancellationProductStaticId]
        .join(" ")
        .toLowerCase(),
    },
  ])
);

export const WIDGET_STRUCTURES: Record<string, StructureNode[]> = {
  "wg-qa-republish": buildRetentionStructure(),
};

// Default selected Structure node per Widget config (mirrors Variant defaults).
export const WIDGET_DEFAULT_SELECTION: Record<string, string> = {
  "wg-qa-republish": "wg-widget-settings",
};

// The Offers collection node id (used by the shell to gate the Offers filter).
export const WIDGET_OFFERS_NODE_ID = "wg-offers";

// Widget preview payload, keyed by config id. Reuses PreviewData so LivePreview
// renders it with the existing neutral-tone template.
export const WIDGET_PREVIEWS: Record<string, PreviewData> = {
  "wg-qa-republish": {
    title: "Retention widget",
    subtitle: "/retention-service-config-us",
    tone: "neutral",
    body: "Preview of the retention service configuration. Select a Structure area to author its Journey Flows, Offers, Segmentation, or Survey Responses.",
  },
};

// The full Widget workspace record, keyed by config id (parallel to VARIANTS).
export const WIDGET_CONFIGS: Record<string, VariantWorkspace> = Object.fromEntries(
  Object.keys(WIDGET_STRUCTURES).map((id) => [
    id,
    {
      id,
      name: collectVariantNames(WIDGETS_TREE)[id] ?? id,
      structure: WIDGET_STRUCTURES[id],
      previewData: WIDGET_PREVIEWS[id],
      defaultSelectionId: WIDGET_DEFAULT_SELECTION[id],
    } satisfies VariantWorkspace,
  ])
);

export function getWidgetConfig(id: string | null): VariantWorkspace | null {
  return id ? WIDGET_CONFIGS[id] ?? null : null;
}

export function isWidgetConfigId(id: string): boolean {
  return id in WIDGET_CONFIGS;
}

// --- Properties field shape (rendered by the Properties region) -------------
export interface PropertyField {
  label: string;
  value: string;
  kind?:
    | "text"
    | "textarea"
    | "checkbox"
    | "switch"
    | "select"
    | "radio"
    | "asset" // asset/icon picker: preview + name + Remove
    | "device"; // one choice per device (Desktop / Tablet / Mobile); value is JSON
  required?: boolean;
  options?: string[]; // choices for "select" / "radio" kinds
  helper?: string; // helper text shown under the control
  // §6 Optional contextual help shown as an info-icon tooltip beside the label.
  tooltip?: string;
  // §item3 Reactive relabel / visibility driven by a sibling field's LIVE value
  // (its author override, else its schema default). Used by the offer code field
  // so it tracks the "Product / Voucher" select as the author changes it.
  dependsOn?: {
    field: string; // sibling field label whose live value is read
    labelMap?: Record<string, string>; // live value → this field's label
    hideWhen?: string[]; // live values that hide this field entirely
  };
  // §item4 Read-only status badge shown in place of an editable control (e.g. an
  // "Expired" pill in an offer's STATUS group). Tones map to Badge variants.
  badge?: string;
  badgeTone?:
    | "success"
    | "warning"
    | "info"
    | "secondary"
    | "destructive"
    | "default";
}

// A titled group of fields (e.g. PRODUCT / CTA / LEGAL). Groups render with a
// subtle heading/divider so the panel stays dense.
export interface PropertyGroup {
  header?: string;
  fields: PropertyField[];
}

export interface ObjectProperties {
  eyebrow: string;
  name: string;
  // Either a flat field list OR grouped fields. `fields` stays for back-compat;
  // when `groups` is present it takes precedence.
  fields?: PropertyField[];
  groups?: PropertyGroup[];
}

// Structural/collection objects: a TYPE eyebrow, a derived "N items" list, and
// no-op action buttons (see Properties region). Items are derived from the
// node's actual Structure children — never hardcoded.
export interface CollectionProperties {
  eyebrow: string;
  name?: string;
  itemNoun: string;
  items: { id: string; label: string }[];
  // Container cap (real tabsConfig.maxSize). Undefined ⇒ unlimited.
  max?: number;
}

// Page sections resolve to a deliberate metadata state: Section ID + Design
// mode radio (Custom / Intelligent authoring). Intelligent authoring is the
// main authoring mode and surfaces an extra affordance (matching real Iceberg).
export interface SectionMetadata {
  eyebrow: string; // "SECTION"
  name: string; // authored label
  role?: SectionRole; // system/domain role (Page Title / Plan Picker / Footer)
  sectionId?: string;
  design?: SectionDesign;
  designOptions?: SectionDesign[];
  intelligentAffordance?: boolean; // show the Intelligent-authoring selector/docs
  status?: string;
  note?: string;
}

// A deliberate "this object has no configured content" state (e.g. an empty
// Predecision variation). Distinct from a missing panel.
export interface NoticeProperties {
  eyebrow: string;
  name: string;
  message: string;
  detail?: string;
}

// Discriminated union returned by resolvePropertiesFor — every selectable node
// resolves to exactly one meaningful kind.
export type ResolvedProperties =
  | { kind: "fields"; data: ObjectProperties }
  | { kind: "collection"; data: CollectionProperties }
  | { kind: "metadata"; data: SectionMetadata }
  | { kind: "notice"; data: NoticeProperties };

// --- Assemble Variant workspaces from the split sample modules --------------
export { OBJECT_PROPERTIES };

// Human-readable Variant names, derived from the PAGES tree variant rows.
const VARIANT_NAMES: Record<string, string> = collectVariantNames(PAGES_TREE);

function collectVariantNames(
  nodes: TreeNode[],
  acc: Record<string, string> = {}
): Record<string, string> {
  for (const node of nodes) {
    if (node.type === "variant") acc[node.id] = node.label;
    if (node.children) collectVariantNames(node.children, acc);
  }
  return acc;
}

// The full Variant workspace record, keyed by Variant id.
export const VARIANTS: Record<string, VariantWorkspace> = Object.fromEntries(
  Object.keys(VARIANT_STRUCTURES).map((id) => [
    id,
    {
      id,
      name: VARIANT_NAMES[id] ?? id,
      structure: VARIANT_STRUCTURES[id],
      previewData: VARIANT_PREVIEWS[id],
      defaultSelectionId: VARIANT_DEFAULT_SELECTION[id],
    } satisfies VariantWorkspace,
  ])
);

// Placeholder variants for inventory pages with no captured content.
Object.assign(VARIANTS, placeholderVariants(PAGES_TREE));

export function getVariant(id: string | null): VariantWorkspace | null {
  return id ? VARIANTS[id] ?? null : null;
}

export function isVariantId(id: string): boolean {
  return id in VARIANTS;
}

// Page-section labels that resolve to the metadata state (fallback when a node
// has no explicit objectType — e.g. the non-canonical sample Variants).
const PAGE_SECTION_LABELS = [
  "title",
  "see what",
  "faq",
  "legal",
  "premium card first test",
];

// Publish status shown in the metadata state, keyed by (lower-cased) section
// label. Anything unlisted defaults to "draft".
const SECTION_STATUS: Record<string, string> = {
  title: "published",
  "see what": "draft",
  faq: "published",
  legal: "published",
  "premium card first test": "in-review",
};

// Item noun per collection object type (for "+ Add {noun}" / "Paste {noun}").
const COLLECTION_NOUNS: Partial<Record<StructureObjectType, string>> = {
  "section-content": "Variation",
  categories: "Category",
  "variant-categories": "Category",
  products: "Product",
  "plan-picker-data": "Plan",
  "product-features-list": "Feature",
  "price-cadence": "Cadence",
  pricing: "Pricing Option",
};

// Maps a node's actual Structure children to derived collection items.
function childrenToItems(node: TreeNode): { id: string; label: string }[] {
  return (node.children ?? []).map((c) => ({ id: c.id, label: c.label }));
}

function metadataFor(node: TreeNode): ResolvedProperties {
  const design = node.design ?? "Custom";
  return {
    kind: "metadata",
    data: {
      eyebrow: "SECTION",
      name: node.label,
      role: node.role,
      sectionId: node.sectionId ?? node.id,
      design,
      designOptions: ["Custom", "Intelligent authoring"],
      intelligentAffordance: design === "Intelligent authoring",
      status: SECTION_STATUS[node.label.toLowerCase()],
    },
  };
}

function collectionFor(
  node: TreeNode,
  type: StructureObjectType
): ResolvedProperties {
  return {
    kind: "collection",
    data: {
      eyebrow: node.label.toUpperCase(),
      name: node.label,
      itemNoun: COLLECTION_NOUNS[type] ?? "Item",
      items: childrenToItems(node),
      max: node.maxChildren ?? maxChildrenFor(type),
    },
  };
}

// Type-aware classification. Prefers node.objectType (canonical 0609); falls
// back to label/parent-label matching for the other sample Variants. Every
// branch returns a meaningful, non-empty state.
export function classifyNode(
  node: TreeNode,
  parent: TreeNode | null
): ResolvedProperties {
  // Canonical nodes may carry an authored payload — use it verbatim.
  if (node.props) return node.props;

  // Schema-driven collections (a real layout's `tabs`) resolve live from their
  // children so add/remove/reorder is reflected immediately, using the noun and
  // cap captured from the schema at build time.
  if (node.objectType === "schema-collection") {
    return {
      kind: "collection",
      data: {
        eyebrow: node.label.toUpperCase(),
        name: node.label,
        itemNoun: node.itemNoun ?? "Item",
        items: childrenToItems(node),
        max: node.maxChildren,
      },
    };
  }

  const label = node.label.toLowerCase();
  const parentLabel = parent?.label.toLowerCase() ?? "";
  const t = node.objectType;

  // --- registry-driven (canonical 0609 + any typed node) -------------------
  // The element registry (elements.ts) is the single source of truth for how a
  // type resolves to a schema, mirroring elements.modules / elements.layouts.
  const def = getElementDef(t);
  if (def?.build) return def.build(node, parent);

  // --- label fallback (non-canonical sample Variants) ----------------------
  const collections: Partial<Record<string, StructureObjectType>> = {
    "section content": "section-content",
    categories: "categories",
    "variant categories": "variant-categories",
    products: "products",
    "plan picker data": "plan-picker-data",
    "product features": "product-features-list",
    "product features list": "product-features-list",
    "price cadence": "price-cadence",
    "pricing options": "pricing",
    pricing: "pricing",
  };
  if (collections[label]) return collectionFor(node, collections[label]!);

  if (label === "section options") {
    return { kind: "fields", data: sectionOptionsSchema(parent?.design) };
  }
  if (label === "control" || label === "predecision" || label === "default") {
    return { kind: "fields", data: controlSchema(node.label) };
  }
  if (label === "plans" || label === "bundles") {
    return { kind: "fields", data: categorySchema(node.label) };
  }
  if (parentLabel === "products" || parentLabel === "plan picker data") {
    return { kind: "fields", data: productSchema(node.label) };
  }
  if (parentLabel === "product features" || parentLabel === "product features list") {
    return { kind: "fields", data: featureSchema(node.label) };
  }
  if (
    parentLabel === "price cadence" ||
    parentLabel === "pricing options" ||
    parentLabel === "pricing"
  ) {
    return { kind: "fields", data: cadenceSchema(node.label) };
  }
  if (parentLabel === "categories" || parentLabel === "variant categories") {
    return { kind: "fields", data: categorySchema(node.label) };
  }

  if (parent === null || PAGE_SECTION_LABELS.includes(label)) {
    return metadataFor(node);
  }

  // Default fallback — never empty.
  return { kind: "fields", data: controlSchema(node.label) };
}

// Resolves the Properties for a Structure object within a given Variant.
// Order: (1) authored OBJECT_PROPERTIES[nodeId] → fields; (2) classifyNode
// (which itself prefers an authored node.props payload, then objectType).
export function resolvePropertiesFor(
  variantId: string,
  nodeId: string
): ResolvedProperties {
  const variant = VARIANTS[variantId];
  if (variant) {
    const found = findNodeWithParent(variant.structure, nodeId, null);
    if (found?.node.props) return found.node.props;
    if (OBJECT_PROPERTIES[nodeId]) {
      return { kind: "fields", data: OBJECT_PROPERTIES[nodeId] };
    }
    if (found) return classifyNode(found.node, found.parent);
  }
  if (OBJECT_PROPERTIES[nodeId]) {
    return { kind: "fields", data: OBJECT_PROPERTIES[nodeId] };
  }
  return {
    kind: "metadata",
    data: {
      eyebrow: "SECTION",
      name: nodeId,
      status: "draft",
      sectionId: nodeId,
      designOptions: ["Custom", "Intelligent authoring"],
      design: "Custom",
    },
  };
}

// Resolves Properties from a LIVE VariantWorkspace (the edited structure held in
// the shell's per-experience memory) rather than the static VARIANTS dataset.
// This is what makes runtime-created nodes — added layouts, added plans, and
// duplicated/pasted subtrees (all of which have ids absent from VARIANTS) —
// resolve to their real schema instead of the metadata fallback.
export function resolvePropertiesForVariant(
  variant: VariantWorkspace,
  nodeId: string
): ResolvedProperties {
  const found = findNodeWithParent(variant.structure, nodeId, null);
  if (found?.node.props) return found.node.props;
  if (OBJECT_PROPERTIES[nodeId]) {
    return { kind: "fields", data: OBJECT_PROPERTIES[nodeId] };
  }
  if (found) return classifyNode(found.node, found.parent);
  return {
    kind: "metadata",
    data: {
      eyebrow: "SECTION",
      name: nodeId,
      status: "draft",
      sectionId: nodeId,
      designOptions: ["Custom", "Intelligent authoring"],
      design: "Custom",
    },
  };
}

// Live-structure counterpart for Widget configs (mirrors the page resolver).
export function resolveWidgetPropertiesForVariant(
  config: VariantWorkspace,
  nodeId: string
): ResolvedProperties {
  const found = findNodeWithParent(config.structure, nodeId, null);
  // Authored nodes carry their panel verbatim (props-first). Runtime-added nodes
  // (Add Offer / Response / Category / Segment) have no props, so fall back to
  // the element registry (classifyNode) which builds an empty schema-driven
  // panel for the widget type — the same schema-driven path pages use.
  if (found) return classifyNode(found.node, found.parent);
  return {
    kind: "notice",
    data: {
      eyebrow: "WIDGET AREA",
      name: nodeId,
      message: "No configured content yet.",
      detail: "This retention widget area is not modelled in the prototype yet.",
    },
  };
}

// Resolves the Properties for a Structure node within a Widget config. Every
// Widget Structure node carries an authored `props` payload (attached by the
// builders above), so this returns it verbatim — object-type driven, never
// label-string matched. Falls back to a notice only for unmodelled nodes.
export function resolveWidgetPropertiesFor(
  configId: string,
  nodeId: string
): ResolvedProperties {
  const config = WIDGET_CONFIGS[configId];
  const node = config ? findNode(config.structure, nodeId) : null;
  if (node?.props) return node.props;
  return {
    kind: "notice",
    data: {
      eyebrow: "WIDGET AREA",
      name: node?.label ?? nodeId,
      message: "No configured content yet.",
      detail: "This retention widget area is not modelled in the V2 prototype yet.",
    },
  };
}

// Seeds the set of expanded node ids for a Variant's structure from its
// defaultExpanded flags (used to initialise per-Variant expansion memory).
export function seedExpandedFor(variantId: string): Set<string> {
  return seedExpandedFrom(VARIANTS[variantId]?.structure);
}

// Widget counterpart to seedExpandedFor, keyed by config id.
export function seedWidgetExpandedFor(configId: string): Set<string> {
  return seedExpandedFrom(WIDGET_CONFIGS[configId]?.structure);
}

// Shared expansion seeder for any Structure tree.
function seedExpandedFrom(structure: StructureNode[] | undefined): Set<string> {
  const acc = new Set<string>();
  if (structure) collect(structure);
  return acc;
  function collect(nodes: StructureNode[]) {
    for (const node of nodes) {
      if (node.defaultExpanded) acc.add(node.id);
      if (node.children) collect(node.children);
    }
  }
}

export function findNodeWithParent(
  nodes: TreeNode[],
  id: string,
  parent: TreeNode | null
): { node: TreeNode; parent: TreeNode | null } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, parent };
    if (node.children) {
      const hit = findNodeWithParent(node.children, id, node);
      if (hit) return hit;
    }
  }
  return null;
}

// Convenience: locate a node by id without needing its parent.
export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  return findNodeWithParent(nodes, id, null)?.node ?? null;
}
