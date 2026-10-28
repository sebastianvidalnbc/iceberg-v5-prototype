import { PRODUCTION_WIDGETS, type ProductionWidget } from "./production-widgets";
import {
  WIDGET_CONFIGS,
  type PreviewData,
  type StructureNode,
  type TreeNode,
} from "./data";
import { buildLayoutNode, getLayoutDef } from "./layouts";
import { LAYOUT_WIDGETS, layoutDefForWidget } from "./layout-widgets";
import { WIDGET_VARIANTS } from "./widget-variants";

// Widget registry shared by the Widgets list, the editor collection and the
// editor itself. Every production widget gets an editable config (empty
// Structure until sections are added from the Layout Picker). Widgets created
// in this session ("+" on the Widgets list) are prepended to the list.

const CREATED: ProductionWidget[] = [];
let createdSeq = 0;

export function productionWidgetId(slug: string): string {
  return `wg-prod-${slug.replace(/^\//, "")}`;
}

export function allWidgets(): ProductionWidget[] {
  return [...CREATED, ...PRODUCTION_WIDGETS, ...LAYOUT_WIDGETS];
}

function emptyWidgetPreview(slug: string): PreviewData {
  return {
    title: "Empty widget",
    subtitle: slug,
    tone: "neutral",
    body: "No sections yet. Start from a layout to build this widget.",
  };
}

function registerConfig(id: string, slug: string, structure: StructureNode[] = []): void {
  WIDGET_CONFIGS[id] = {
    id,
    name: slug,
    structure,
    previewData: emptyWidgetPreview(slug),
    defaultSelectionId: structure[0]?.id ?? "",
  };
}

for (const w of PRODUCTION_WIDGETS) registerConfig(productionWidgetId(w.slug), w.slug);

// Set the section heading on a freshly built layout section. The value is stored
// as an authored field override on the node that owns the field (the same path a
// typed edit takes), so the preview and the Properties panel both read it. Labels
// are matched in the preview's title priority order.
const HEADING_LABELS = [
  "Heading - H1",
  "Heading",
  "Header",
  "Plan Picker Title",
  "Faq Heading",
  "Header Title",
  "Title",
  "Headline",
];

// Field labels can carry a qualifier ("Plan Picker Title (optional)"); match on the base.
const baseLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, "").trim();

function fieldLabelsOf(node: StructureNode): string[] {
  const data = node.props?.kind === "fields" ? node.props.data : null;
  return [...(data?.fields ?? []), ...(data?.groups ?? []).flatMap((g) => g.fields)].map(
    (f) => f.label,
  );
}

// The node that owns a field matching `base`, plus the field's exact label.
function findField(node: StructureNode, base: string): { owner: StructureNode; label: string } | null {
  // Collection items carry their own Title fields; the section heading never lives there.
  if (node.objectType === "schema-collection") return null;
  const label = fieldLabelsOf(node).find((l) => baseLabel(l) === base);
  if (label) return { owner: node, label };
  for (const c of node.children ?? []) {
    const hit = findField(c, base);
    if (hit) return hit;
  }
  return null;
}

function applyHeading(root: StructureNode, text: string): void {
  for (const base of HEADING_LABELS) {
    const hit = findField(root, base);
    if (hit) {
      hit.owner.content = { ...(hit.owner.content ?? {}), [hit.label]: text };
      return;
    }
  }
}

// Layout widgets: one config per widget (its default section) and one per
// sample variant, each built from the same catalog layout.
for (const w of LAYOUT_WIDGETS) {
  const def = layoutDefForWidget(w.slug);
  if (!def) continue;
  registerConfig(productionWidgetId(w.slug), w.slug, [buildLayoutNode(def)]);
  for (const v of WIDGET_VARIANTS[w.slug] ?? []) {
    const section = buildLayoutNode(def);
    if (v.heading) applyHeading(section, v.heading);
    registerConfig(v.id, w.slug, [section]);
    WIDGET_CONFIGS[v.id].name = v.name;
  }
}

// Flat collection for the editor's left pane (Pages-style: one row per widget).
export function widgetCollectionTree(): TreeNode[] {
  return allWidgets().map((w) => ({
    id: productionWidgetId(w.slug),
    label: w.slug,
    type: "page",
    kind: "path",
    children: [],
  }));
}

function listDate(ts: number): string {
  const d = new Date(ts);
  const wd = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${wd} ${dd} ${mon} ${yy}`;
}

// "+" on the Widgets list: a new widget starts from a layout. Returns the new
// widget id (the editor route) or null if the layout is unknown.
export function createWidgetFromLayout(layoutId: string): string | null {
  const def = getLayoutDef(layoutId);
  if (!def) return null;
  createdSeq += 1;
  const slug = `/new-widget-${createdSeq}`;
  const now = Date.now();
  // Production format for a layout-built widget is not confirmed; HTML is the
  // default shown here.
  CREATED.unshift({
    slug,
    format: "HTML",
    status: "Draft",
    created: listDate(now),
    modified: "just now",
    createdAt: now,
    modifiedAt: now,
  });
  const id = productionWidgetId(slug);
  registerConfig(id, slug, [buildLayoutNode(def)]);
  return id;
}
