// Derives a live, renderable preview of the WHOLE variant/page — the way a
// Figma frame shows every element inside it. The canvas composes ALL top-level
// sections of the active variant and never re-scopes to the selected layer:
//   • it changes when you switch VARIANTS (a different page composition),
//   • it updates live as you EDIT a field's value,
//   • selecting a Structure layer does NOT change what's rendered — it only
//     drives the edit panel and highlights that element in the canvas.
//
// Faithful to real Iceberg: the schema comes from the element registry (via
// classifyNode) and the VALUES come from each instance's `node.content`
// (the `placeholder.content` analog). The renderer overlays content on the
// schema defaults — it never mutates data. The render itself inherits the real
// Peacock design system (renderer/brand.css), so every layout type renders as
// an on-brand section (plan-picker cards, hero, banner, FAQ, rail, grid, …).
import {
  classifyNode,
  OBJECT_PROPERTIES,
  type ResolvedProperties,
  type StructureNode,
  type VariantWorkspace,
} from "./data";
import { previewRoleFor } from "./elements";

// A single product feature (bullet): the checkmark/icon + its text. `id` is the
// feature node's Structure id, so clicking the bullet selects that node.
export interface PreviewFeature {
  id?: string;
  icon?: string;
  text: string;
}

export interface PreviewCard {
  id: string;
  title: string;
  titleIcon?: string;
  // "Product Logo" — the product/brand mark shown above the card title.
  logo?: string;
  eyebrow?: string;
  badge?: string;
  description?: string;
  features: PreviewFeature[];
  price?: string;
  priceCadence?: string;
  // Verified IA pricing-block extras (all optional; render only when authored).
  priceStrike?: string; // "Strike Through Price" — struck-out original price
  priceSavings?: string; // "Offer Detail" — savings eyebrow (e.g. "Save 30%")
  priceCadenceText?: string; // "Price Cadence and Subtext" — e.g. "/month"
  priceDetails?: string; // "Offer Detail Description" — small offer copy
  priceAria?: string; // "Price Aria Label" — accessible name for the price block
  cta?: string;
  ctaHref?: string; // "Primary CTA HREF" — destination for the card CTA link
  // "Description - Legal" / "Legal Description" — per-plan fine print rendered
  // OUTSIDE and BELOW the card (real IA plan-picker per-card legal block).
  legal?: string;
}

// A generic tile/row used by non-plan-picker layouts (FAQ Q/A, rail/grid tiles,
// steps, comparison rows, footer columns). Synthesised on-brand so every layout
// in the catalog renders a recognisable Peacock section.
export interface PreviewItem {
  title?: string;
  body?: string;
  icon?: string;
}

export type PreviewKind =
  | "plans"
  | "hero"
  | "banner"
  | "faq"
  | "rail"
  | "grid"
  | "comparison"
  | "footer"
  | "countdown"
  | "steps"
  | "message"
  | "generic";

// A plan-picker category (a `categories` tab): its title drives the Plans /
// Bundles toggle, and it owns its own product cards.
export interface PreviewCategory {
  id: string;
  title: string;
  cards: PreviewCard[];
}

// One rendered SECTION of the page (a top-level Structure node). The page is a
// vertical stack of these, mirroring how the variant's sections compose.
export interface PreviewSection {
  // The section's element instance id, so selecting/Pick-Section maps to it.
  nodeId: string;
  kind: PreviewKind;
  // Peacock background treatment (from the layout's Select Background option).
  background: "light" | "dark" | "branded";
  eyebrow?: string;
  title: string;
  subtitle?: string;
  alignment: "left" | "centre" | "right";
  disclaimer?: string;
  message?: string;
  // Section-level primary CTA (hero / banner bodies). Picked from the header
  // fields; rendered only by kinds that own a section CTA.
  cta?: string;
  ctaHref?: string;
  cards: PreviewCard[];
  // Plan-picker categories (Plans / Bundles …). Present when the section has a
  // `categories` collection; when 2+, the render shows a category toggle and
  // `cards` mirrors the first category.
  categories?: PreviewCategory[];
  items: PreviewItem[];
}

export interface PreviewModel {
  variantName: string;
  sections: PreviewSection[];
}

// Strip HTML tags from rich-text values so preview copy renders as plain text.
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

// Flatten a resolved "fields" object (flat or grouped) into label→value.
function flattenFields(props: ResolvedProperties): Record<string, string> {
  const out: Record<string, string> = {};
  if (props.kind !== "fields") return out;
  const groups = props.data.groups ?? [{ fields: props.data.fields ?? [] }];
  for (const g of groups) for (const f of g.fields) out[f.label] = f.value;
  return out;
}

// The effective field values for a node: schema defaults (from the registry via
// classifyNode) with the instance's authored `content` values layered on top.
function fieldsForNode(
  node: StructureNode,
  parent: StructureNode | null,
): Record<string, string> {
  const base = flattenFields(classifyNode(node, parent));
  // Layer authored sample values (OBJECT_PROPERTIES[nodeId]) the way the
  // Properties panel does, so preview copy matches what the author sees/edits —
  // e.g. the Premium card's description and per-card legal fine print. Instance
  // `content` overrides win last (live edits).
  const authored = OBJECT_PROPERTIES[node.id]
    ? flattenFields({ kind: "fields", data: OBJECT_PROPERTIES[node.id] })
    : {};
  const merged: Record<string, string> = { ...base, ...authored, ...(node.content ?? {}) };
  // A qualified label ("Subtitle (optional)") also answers to its base name, so the
  // title and subtitle pickers find it. Existing keys are never overwritten.
  for (const key of Object.keys(merged)) {
    const bare = key.replace(/\s*\(.*\)\s*$/, "").trim();
    if (bare !== key && !(bare in merged)) merged[bare] = merged[key];
  }
  return merged;
}

function pick(map: Record<string, string>, labels: string[]): string | undefined {
  for (const l of labels) {
    const v = map[l];
    if (v != null && v.trim() !== "") return v;
  }
  return undefined;
}

const TITLE_LABELS = [
  "Heading - H1",
  "Plan Builder Title",
  "Heading",
  "Header",
  "Plan Picker Title",
  "Category Title",
  "Category Label",
  "Error Title",
  "Title",
  // Sections that title themselves with a Headline, FAQ Heading or Header Title
  // field. They sit last so any section with a real title field keeps using that.
  "Headline",
  "Faq Heading",
  "Header Title",
];
const SUBTITLE_LABELS = [
  "Description",
  "Subtitle",
  "Subheader",
  "Sub-heading",
  "Error Body",
];

// A node renders as a product/plan card if its collection's item noun reads as
// a product/plan/card (schema-driven), or (sample variants) it sits under a
// Products / Plan Picker Data list. Feature/bundle/option items are excluded.
function isProductNode(node: StructureNode, parent: StructureNode | null): boolean {
  if (previewRoleFor(node) === "product") return true;
  // A schema item that carries its own product/plan title is a card, whatever
  // its collection is called (Plan Cards in the Plan Builder layout).
  if (hasPlanTitleField(node)) return true;
  const pl = parent?.label.toLowerCase() ?? "";
  if (pl === "products" || pl.includes("plan picker data")) return true;
  const noun = (parent?.itemNoun ?? "").toLowerCase();
  if (/\b(product|plan|card)\b/.test(noun) && !/feature|bundle|option|increment/.test(noun)) {
    return true;
  }
  return false;
}

function hasPlanTitleField(node: StructureNode): boolean {
  if (node.props?.kind !== "fields") return false;
  return (node.props.data.groups ?? []).some((g) =>
    g.fields.some((f) => /^(product|plan) title$/i.test(f.label)),
  );
}

// Whether a collection node holds a product's feature bullets.
function isFeatureCollection(node: StructureNode): boolean {
  const l = node.label.toLowerCase();
  const noun = (node.itemNoun ?? "").toLowerCase();
  return (
    node.objectType === "product-features-list" ||
    l.includes("feature") ||
    l.includes("product list") ||
    noun.includes("feature")
  );
}

// Collect a product card's feature bullets (icon + text) from its feature-list
// child collection(s).
function collectFeatures(product: StructureNode): PreviewFeature[] {
  const out: PreviewFeature[] = [];
  for (const child of product.children ?? []) {
    if (!isFeatureCollection(child)) continue;
    for (const item of child.children ?? []) {
      const fm = fieldsForNode(item, child);
      const raw = pick(fm, ["Product Feature", "Feature Description", "Feature", "Description"]);
      if (!raw) continue;
      out.push({
        id: item.id,
        icon: pick(fm, ["Product Feature Icon", "Feature Icon", "Icon"]) ?? "check",
        text: stripHtml(raw),
      });
    }
  }
  return out;
}

function childByType(
  node: StructureNode,
  type: string,
  labelHint: string,
): StructureNode | undefined {
  return (node.children ?? []).find(
    (c) => c.objectType === type || c.label.toLowerCase().includes(labelHint),
  );
}

function buildCard(
  product: StructureNode,
  parent: StructureNode | null,
): PreviewCard {
  const map = fieldsForNode(product, parent);
  const title =
    pick(map, ["Product Title", "Plan Title", "Title", "Plan Name", "Card Title"]) ??
    product.label;
  const titleIcon = pick(map, ["Product Title Icon", "Title Icon"]);
  const logo = pick(map, ["Product Logo"]);
  const eyebrow = pick(map, ["Eyebrow"]);
  // Badge only shows when its toggle is on (the schema's Badge checkbox).
  const badge = map["Badge"] === "true" ? pick(map, ["Badge Text"]) ?? "Best Value" : undefined;
  const descRaw = pick(map, ["Product Description", "Description"]);
  const description = descRaw ? stripHtml(descRaw) : undefined;

  // Cadence source: the first Price Cadence item, used as a fallback for both
  // pricing AND the CTA so cadence-authored values still render on the card.
  const clist = childByType(product, "price-cadence", "cadence");
  const firstCad = clist?.children?.[0];
  const cm = firstCad ? fieldsForNode(firstCad, clist ?? null) : {};

  // Primary CTA: the schema-switcher selects Custom / Central Management. The
  // real card renders a button only when a CTA is authored — "None"/empty means
  // no button (not a button labelled "None"). Card-level fields win; a
  // cadence-authored CTA (text/href) is honoured when the card leaves it blank.
  const ctaText =
    pick(map, ["Primary CTA", "Primary CTA Text", "CTA", "CTA Text"]) ??
    pick(cm, ["Primary CTA", "Primary CTA Text"]);
  const cta =
    ctaText && ctaText.toLowerCase() !== "none" ? ctaText : undefined;
  const ctaHref = cta
    ? pick(map, ["Primary CTA HREF"]) ?? pick(cm, ["Primary CTA HREF"])
    : undefined;

  const features = collectFeatures(product);

  // Price. Primary source is the product card's OWN Pricing fields (the schema
  // single-price model, authored right on the card). Fall back to the first
  // Price Cadence item so any cadence-authored data still renders.
  const price =
    pick(map, ["Offer Price"]) ??
    pick(cm, ["Offer Price", "Strikethrough Price"]);
  const priceStrike =
    pick(map, ["Strike Through Price"]) ??
    pick(cm, ["Strike Through Price", "Strikethrough Price"]);
  const priceSavings = pick(map, ["Offer Detail"]) ?? pick(cm, ["Offer Detail"]);
  const priceCadenceText =
    pick(map, ["Price Cadence and Subtext"]) ??
    pick(cm, ["Price Cadence and Subtext"]);
  const detRaw =
    pick(map, ["Offer Detail Description"]) ??
    pick(cm, [
      "Offer Detail Description RTE",
      "Offer Detail Description",
      "Offer Price Description RTE",
    ]);
  const priceDetails = detRaw ? stripHtml(detRaw) : undefined;
  const priceCadence = firstCad?.label;
  // Accessible name for the price block (schema "Price Aria Label"), falling
  // back to the cadence item's "Aria Label" when authored there instead.
  const priceAria = pick(map, ["Price Aria Label"]) ?? pick(cm, ["Aria Label"]);

  // Per-card legal (fine print under the card). The sample Product schema pairs a
  // "Legal" type select (None/Standard/Custom) with a "Legal Description"
  // textarea; schema-built layouts use the "Description - Legal" rich-text field.
  // Render whenever copy is authored — the textarea is what the author types, so
  // it must appear live (WYSIWYG). The "Legal" type select no longer gates it:
  // gating on "None" silently swallowed typed copy, which read as a broken
  // preview. Empty copy ⇒ no legal block.
  const legalRaw = pick(map, ["Legal Description", "Description - Legal"]);
  const legal = legalRaw && legalRaw.trim() ? stripHtml(legalRaw) : undefined;

  return {
    id: product.id,
    title,
    titleIcon,
    logo,
    eyebrow,
    badge,
    description,
    features,
    price,
    priceCadence,
    priceStrike,
    priceSavings,
    priceCadenceText,
    priceDetails,
    priceAria,
    cta,
    ctaHref,
    legal,
  };
}

// Whether a node is the plan-picker's `categories` collection (Plans / Bundles).
function isCategoriesCollection(node: StructureNode): boolean {
  const l = node.label.toLowerCase();
  const noun = (node.itemNoun ?? "").toLowerCase();
  return (
    node.objectType === "categories" ||
    ((node.objectType === "schema-collection") &&
      (l.includes("categor") || noun.includes("categor")))
  );
}

// Find the categories collection anywhere in a section's content subtree.
function findCategoriesNode(node: StructureNode): StructureNode | null {
  if (isCategoriesCollection(node)) return node;
  for (const c of node.children ?? []) {
    const hit = findCategoriesNode(c);
    if (hit) return hit;
  }
  return null;
}

// Collect every product/plan card within a subtree (including the root itself).
function collectCards(
  node: StructureNode,
  parent: StructureNode | null,
  out: PreviewCard[],
): void {
  if (isProductNode(node, parent)) {
    out.push(buildCard(node, parent));
    return; // a product's own subtree feeds its card, not nested cards
  }
  for (const c of node.children ?? []) collectCards(c, node, out);
}

// Aggregate the non-product "header" fields within a subtree (Plan Picker Title,
// Subtitle, Disclaimer, Error copy…). Product subtrees are skipped because their
// fields belong to cards, not the section band.
function aggregateHeaderFields(
  node: StructureNode,
  parent: StructureNode | null,
  acc: Record<string, string>,
): void {
  if (isProductNode(node, parent)) return;
  // A schema-collection's items carry their OWN fields (Faq Title, Row Title,
  // grid "Title", Membership "Title"…). Those belong to the items, not the
  // section band — descending into them would let an item's Title overwrite the
  // section title. The section's own copy lives on its Section Content fields.
  if (node.objectType === "schema-collection") return;
  Object.assign(acc, fieldsForNode(node, parent));
  for (const c of node.children ?? []) aggregateHeaderFields(c, node, acc);
}

// All variation nodes (Control / Predecision / Variant A…) within a section.
function variationsIn(section: StructureNode): StructureNode[] {
  const out: StructureNode[] = [];
  const walk = (n: StructureNode) => {
    if (n.objectType === "variation") out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  for (const c of section.children ?? []) walk(c);
  return out;
}

// The content root that feeds a section's render: the active variation
// (mvtOverride if it belongs to this section, else the first non-empty one) when
// the section has variations, otherwise the section itself.
function contentRootFor(
  section: StructureNode,
  mvtOverride: string | null,
): StructureNode {
  const variations = variationsIn(section);
  if (variations.length === 0) return section;
  if (mvtOverride) {
    const hit = variations.find((v) => v.id === mvtOverride);
    if (hit) return hit;
  }
  return variations.find((v) => (v.children?.length ?? 0) > 0) ?? variations[0];
}

// Classify a section into a Peacock render kind from its role/label (and whether
// it resolved to product cards). Every layout maps to a kind — nothing is blank.
function classifyKind(
  section: StructureNode,
  cardsCount: number,
  message: string | undefined,
): PreviewKind {
  if (cardsCount > 0) return "plans";
  const key = `${section.role ?? ""} ${section.label}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => key.includes(x));
  if (has("faq")) return "faq";
  if (has("comparison")) return "comparison";
  if (has("footer")) return "footer";
  if (has("countdown")) return "countdown";
  if (has("step", "sub-navigation", "sub navigation")) return "steps";
  if (has("carousel", "rail", "highlight", "promotional", "sle", "season", "episode", "channels", "cast"))
    return "rail";
  if (has("grid", "logo", "catalogue", "filtered", "content grid"))
    return "grid";
  if (has("hero", "key art", "synopsis")) return "hero";
  if (has("banner", "text & tcs", " tcs", "countdown")) return "banner";
  if (message) return "message";
  return "generic";
}

// Synthesise on-brand placeholder items for non-data-bound layout kinds so the
// section renders a recognisable Peacock shape (real copy comes from the fields;
// the tiles/rows are schematic until those layouts are modelled field-by-field).
function synthItems(kind: PreviewKind): PreviewItem[] {
  switch (kind) {
    case "faq":
      return [
        { title: "How much does it cost?", body: "Choose the plan that suits you. Cancel anytime." },
        { title: "Can I change my plan later?", body: "Yes — upgrade or downgrade whenever you like." },
        { title: "What devices are supported?", body: "Stream on web, mobile, tablet, and connected TV." },
      ];
    case "rail":
      return Array.from({ length: 5 }, (_, i) => ({ title: `Title ${i + 1}` }));
    case "grid":
      return Array.from({ length: 6 }, (_, i) => ({ title: `Item ${i + 1}` }));
    case "comparison":
      return [
        { title: "4K UHD & HDR" },
        { title: "Ad-free experience" },
        { title: "Live sports & events" },
        { title: "Download & go" },
      ];
    case "footer":
      return [
        { title: "Company", body: "About · Careers · Press" },
        { title: "Support", body: "Help · Contact · Accessibility" },
        { title: "Legal", body: "Terms · Privacy · Cookies" },
      ];
    case "steps":
      return [
        { title: "Choose your plan", body: "Pick the plan that's right for you." },
        { title: "Create an account", body: "Sign up in seconds." },
        { title: "Start streaming", body: "Watch on any device." },
      ];
    default:
      return [];
  }
}

// --- Authored collection items (non-plan layouts) --------------------------
// Non-plan layouts (FAQ, Steps, Footer, Cast, Rail, Grid, Comparison…) store
// their repeatable content in schema-collection nodes whose schema-item children
// carry per-item fields. Field labels vary wildly across the 40 layouts ("Faq
// Title", "Row Title", "Headline", "Image Text"…), so items are mapped to the
// unified PreviewItem via FUZZY keyword matching rather than exact labels.

// Ordered by priority: the first field whose label CONTAINS one of these (and
// isn't a config field) becomes the item title / body.
const ITEM_TITLE_KEYWORDS = ["title", "heading", "headline", "name", "question", "header"];
const ITEM_BODY_KEYWORDS = [
  "answer", "content", "synopsis", "description", "subtitle", "subhead", "body", "copy", "text",
];

// Labels that are configuration/accessibility, never display copy — excluded
// from title/body matching so e.g. "Aria Label" or "URL Link" is never shown.
function isConfigLabel(label: string): boolean {
  const l = label.toLowerCase();
  return [
    "url", "href", "aria", "alt tag", "alt text", "accessibility", "region",
    "orientation", "background", "theme", "embed", "override", "icon",
    "show ", "enable", "full bleed",
  ].some((s) => l.includes(s));
}

// First non-config, non-boolean field whose label contains one of `keywords`
// (priority order). Pass "" to match the first eligible field of any label.
function pickByKeywords(
  map: Record<string, string>,
  keywords: string[],
  exclude: Set<string>,
): { label: string; value: string } | undefined {
  for (const kw of keywords) {
    for (const [label, value] of Object.entries(map)) {
      if (exclude.has(label)) continue;
      if (!value || !value.trim()) continue;
      const v = value.trim().toLowerCase();
      if (v === "true" || v === "false") continue;
      if (isConfigLabel(label)) continue;
      if (label.toLowerCase().includes(kw)) return { label, value };
    }
  }
  return undefined;
}

// A collection that holds product/plan CARDS (fed by collectCards) rather than
// generic items — excluded from item gathering.
function isCardCollection(node: StructureNode): boolean {
  const noun = (node.itemNoun ?? "").toLowerCase();
  if (/\b(product|plan|card)\b/.test(noun) && !/feature|bundle|option|increment/.test(noun)) {
    return true;
  }
  const l = node.label.toLowerCase();
  return l === "products" || l.includes("plan picker data");
}

// Gather a section's TOP-LEVEL content collections (schema-collection nodes),
// skipping category/feature/card collections. Stops descending once a content
// collection is found so nested collections (footer Items, comparison Columns)
// aren't mistaken for section-level primaries.
function gatherCollections(node: StructureNode, out: StructureNode[]): void {
  for (const c of node.children ?? []) {
    if (c.objectType === "schema-collection") {
      if (isCategoriesCollection(c) || isFeatureCollection(c) || isCardCollection(c)) {
        continue;
      }
      out.push(c);
      continue;
    }
    gatherCollections(c, out);
  }
}

// One collection item → a PreviewItem. Title/body come from fuzzy keyword
// matches; when there's no body field but the item owns a nested collection
// (footer column → links), its children's titles are joined as the body.
function buildItem(item: StructureNode, parent: StructureNode): PreviewItem | null {
  const map = fieldsForNode(item, parent);
  const exclude = new Set<string>();

  const titleHit = pickByKeywords(map, ITEM_TITLE_KEYWORDS, exclude);
  if (titleHit) exclude.add(titleHit.label);
  const bodyHit = pickByKeywords(map, ITEM_BODY_KEYWORDS, exclude);
  if (bodyHit) exclude.add(bodyHit.label);

  let title = titleHit ? stripHtml(titleHit.value) : undefined;
  let body = bodyHit ? stripHtml(bodyHit.value) : undefined;

  // Fallback title: first eligible text field (covers layouts with no
  // title-like label, e.g. Logo Grid's "Image Text").
  if (!title) {
    const anyHit = pickByKeywords(map, [""], exclude);
    if (anyHit) {
      title = stripHtml(anyHit.value);
      exclude.add(anyHit.label);
    }
  }

  // Nested collection → join child titles (footer section links).
  if (!body) {
    for (const child of item.children ?? []) {
      if (child.objectType !== "schema-collection") continue;
      const parts = (child.children ?? [])
        .map((gc) => {
          const gm = fieldsForNode(gc, child);
          const h = pickByKeywords(gm, ITEM_TITLE_KEYWORDS, new Set());
          return h ? stripHtml(h.value) : undefined;
        })
        .filter((s): s is string => Boolean(s));
      if (parts.length) {
        body = parts.join(" · ");
        break;
      }
    }
  }

  if (!title && !body) return null;
  return { title: title ?? item.label, body };
}

// The authored items for a non-plan section: its primary content collection's
// items. For a comparison table the primary is the "Rows" collection (its plan
// columns feed the header, not the feature rows).
function collectItems(root: StructureNode, kind: PreviewKind): PreviewItem[] {
  const cols: StructureNode[] = [];
  gatherCollections(root, cols);
  if (!cols.length) return [];
  let primary = cols[0];
  if (kind === "comparison") {
    primary = cols.find((c) => c.label.toLowerCase().includes("row")) ?? cols[0];
  }
  const items: PreviewItem[] = [];
  for (const child of primary.children ?? []) {
    const it = buildItem(child, primary);
    if (it) items.push(it);
  }
  return items;
}

// Build one PreviewSection from a top-level Structure node.
function buildSection(
  section: StructureNode,
  mvtOverride: string | null,
): PreviewSection {
  const root = contentRootFor(section, mvtOverride);

  // Categories (Plans / Bundles): when the section has a `categories` collection,
  // each category owns its own cards and drives the category toggle. Otherwise
  // the section's cards are collected flat from the content root.
  const catNode = findCategoriesNode(root);
  let categories: PreviewCategory[] | undefined;
  const cards: PreviewCard[] = [];
  if (catNode && (catNode.children?.length ?? 0) > 0) {
    categories = (catNode.children ?? []).map((cat) => {
      const cc: PreviewCard[] = [];
      collectCards(cat, catNode, cc);
      const cm = fieldsForNode(cat, catNode);
      const title = pick(cm, ["Category Title", "Category Label"]) ?? cat.label;
      return { id: cat.id, title, cards: cc };
    });
    cards.push(...(categories[0]?.cards ?? []));
  } else {
    collectCards(root, section, cards);
  }

  const map: Record<string, string> = {};
  aggregateHeaderFields(root, section, map);

  const title = pick(map, TITLE_LABELS) ?? section.label;
  const subtitle = pick(map, SUBTITLE_LABELS);
  const alignmentRaw =
    pick(map, ["Title & Subtitle Alignment", "Title Alignment", "Alignment"]) ?? "Centre";
  const alignment = alignmentRaw.toLowerCase() as PreviewSection["alignment"];

  const discRaw = pick(map, ["Disclaimer Text", "Legal Description"]);
  const disclaimer =
    discRaw && map["Show Disclaimer"] !== "false" ? stripHtml(discRaw) : undefined;

  const message = pick(map, ["Error Body", "Voucher Error Text"]);
  const eyebrow = section.role ?? undefined;

  // Section-level primary CTA (hero / banner). Authored via the section's own
  // CTA fields; "None"/empty means no explicit CTA (the renderer keeps a default
  // label for hero/banner so the band never looks empty).
  const ctaRaw = pick(map, [
    "Primary CTA", "Primary CTA Text", "CTA", "CTA Text", "Link Title", "Button Text",
  ]);
  const cta = ctaRaw && ctaRaw.toLowerCase() !== "none" ? ctaRaw : undefined;
  const ctaHref = cta
    ? pick(map, ["Primary CTA HREF", "CTA HREF", "Link URL", "Button URL"])
    : undefined;

  // Count cards across categories so a plan picker still classifies as "plans"
  // even when the first category happens to be empty.
  const totalCards = categories
    ? categories.reduce((n, c) => n + c.cards.length, 0)
    : cards.length;
  const kind = classifyKind(section, totalCards, message);

  // Authored items for non-plan layouts. Fall back to on-brand synthetic tiles
  // only when the layout has no authorable collection (e.g. ATOM-driven
  // carousels) or the author hasn't added items yet.
  const authoredItems = totalCards ? [] : collectItems(root, kind);
  const items = totalCards
    ? []
    : authoredItems.length
      ? authoredItems
      : synthItems(kind);

  // Background: the Select Background option (light / dark / branded). Peacock is
  // dark-first, so default to dark when unset.
  const bgRaw = (pick(map, ["Select Background", "Background"]) ?? "dark").toLowerCase();
  const background: PreviewSection["background"] =
    bgRaw.includes("light") ? "light" : bgRaw.includes("brand") ? "branded" : "dark";

  return {
    nodeId: section.id,
    kind,
    background,
    eyebrow,
    title,
    subtitle,
    alignment,
    disclaimer,
    message: kind === "message" ? message : undefined,
    cta,
    ctaHref,
    cards,
    categories,
    items,
  };
}

// Build the whole-page preview for the active variant. Independent of the tree
// SELECTION (selection only drives the edit panel + highlight); depends only on
// the variant, the instances' authored content, and the MVT override.
export function derivePreviewModel(
  variant: VariantWorkspace | null,
  mvtOverride: string | null = null,
): PreviewModel {
  if (!variant) return { variantName: "", sections: [] };
  const sections = variant.structure
    .filter((n) => !n.disabled)
    .map((section) => buildSection(section, mvtOverride));
  return { variantName: variant.name, sections };
}

// Collect the experience's content VARIATIONS (Control / Predecision / Variant
// A…) — the MVT/A-B units the real editor exposes via the preview's variant
// dropdown (mvtOverride). Used to let the author preview a specific variation.
export function collectVariationNodes(
  variant: VariantWorkspace | null,
): { id: string; label: string; section?: string }[] {
  if (!variant) return [];
  const out: { id: string; label: string; section?: string }[] = [];
  const walk = (nodes: StructureNode[], section: string | undefined) => {
    for (const n of nodes) {
      const nextSection = n.objectType === "page-section" ? n.label : section;
      if (n.objectType === "variation") {
        out.push({ id: n.id, label: n.label, section: nextSection });
      }
      if (n.children) walk(n.children, nextSection);
    }
  };
  walk(variant.structure, undefined);
  return out;
}
