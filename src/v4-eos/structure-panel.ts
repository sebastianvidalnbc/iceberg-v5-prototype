// Which Structure nodes live in the Properties panel instead of the tree.
//
// A list (collection) that sits inside an item of another list is "panel-only":
// the Products under a plan category, a product's feature bullets, a product's
// price cadences. The tree stops at the items you pick between (the Plans and
// Bundles categories); the panel shows everything under them. A panel-only
// list's own items (the three products, each feature) are shown as tabs or
// inline rows in the Properties panel, not in the tree.
//
// Structure data is unchanged: the nodes still exist, edits still address them
// by id, and the preview still reads them. Only where they are shown changes.
import type { StructureNode, StructureObjectType } from "./data";

const COLLECTION_TYPES = new Set<StructureObjectType>([
  "categories",
  "variant-categories",
  "products",
  "plan-picker-data",
  "product-features-list",
  "price-cadence",
  "pricing",
  "offers",
  "segmentation",
  "segmentation-category",
  "segment-names",
  "survey-responses",
]);

// A `tabs` collection: schema-built lists and the sample Structure's list types.
export function isCollectionNode(node: StructureNode): boolean {
  if (node.objectType === "schema-collection") return true;
  return !!node.objectType && COLLECTION_TYPES.has(node.objectType);
}

// The ids hidden from the tree: every panel-only collection, and its items (they
// are tabs or inline rows in the panel).
export function panelOnlyIds(roots: StructureNode[]): Set<string> {
  const lists = new Set<string>();
  const walk = (
    node: StructureNode,
    parent: StructureNode | null,
    grand: StructureNode | null,
  ) => {
    if (
      isCollectionNode(node) &&
      parent &&
      !isCollectionNode(parent) &&
      grand &&
      isCollectionNode(grand)
    ) {
      lists.add(node.id);
    }
    for (const child of node.children ?? []) walk(child, node, parent);
  };
  for (const root of roots) walk(root, null, null);

  const out = new Set<string>(lists);
  const hideItems = (node: StructureNode) => {
    if (lists.has(node.id)) for (const item of node.children ?? []) out.add(item.id);
    for (const child of node.children ?? []) hideItems(child);
  };
  for (const root of roots) hideItems(root);
  return out;
}

// The panel-only lists a node shows inline in its Properties panel.
export function panelListsOf(node: StructureNode, panelIds: ReadonlySet<string>): StructureNode[] {
  return (node.children ?? []).filter((c) => panelIds.has(c.id));
}

// Does this list's items hold panel-only lists of their own (products with
// features and cadences)? Those items are shown as tabs, one per item.
export function hostsPanelLists(list: StructureNode, panelIds: ReadonlySet<string>): boolean {
  return (list.children ?? []).some((item) => panelListsOf(item, panelIds).length > 0);
}

// A product's panel name: its Product Title (what the card shows) once set, so
// the tab and header follow the title the author edits. The node label is the
// fallback; the tree can't rename a product now that products live in the panel.
export function panelItemTitle(node: StructureNode): string {
  if (node.objectType !== "product" && node.objectType !== "plan") return node.label;
  const title = node.content?.["Product Title"]?.trim();
  return title || node.label;
}
