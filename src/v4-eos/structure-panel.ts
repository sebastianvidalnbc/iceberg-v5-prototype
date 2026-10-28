// Which Structure nodes live in the Properties panel instead of the tree.
//
// Three kinds of list (collection) work together:
//
// - A PANEL-ONLY list is nested inside an item of another list: the Products
//   under a category, a product's feature bullets, a price cadence list. It is
//   hidden from the tree and shown in the Properties panel of its owner.
// - A TABBED list has items that each hold panel-only lists (the three
//   products, each with features and cadences; or a list of plan cards, each
//   with its features). Its items are hidden from the tree and shown as one
//   tab each in the panel, so the author never walks the tree to reach them.
// - Everything else stays in the tree. In particular a category level (Plans,
//   Bundles, Category 1) keeps its items in the tree: each one's own list is
//   a tabbed list, so the category is the last element you pick from the tree.
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

export interface PanelStructure {
  // Hidden from the tree: panel-only lists, and the items of tabbed lists.
  hidden: Set<string>;
  // Lists whose items are tabs in the panel.
  tabbed: Set<string>;
}

export function analyzePanel(roots: StructureNode[]): PanelStructure {
  // 1. Panel-only lists: a list nested in an item of another list.
  const panelOnly = new Set<string>();
  const findPanelOnly = (
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
      panelOnly.add(node.id);
    }
    for (const child of node.children ?? []) findPanelOnly(child, node, parent);
  };
  for (const root of roots) findPanelOnly(root, null, null);

  // 2. Tabbed lists: every item holds a panel-only list whose own items hold
  //    no panel-only lists (features, cadences, columns). A category whose
  //    items hold products does not qualify, so it stays in the tree.
  const isLeafPanelList = (list: StructureNode) =>
    panelOnly.has(list.id) &&
    (list.children ?? []).every(
      (item) => !(item.children ?? []).some((c) => panelOnly.has(c.id)),
    );
  const tabbed = new Set<string>();
  const findTabbed = (node: StructureNode) => {
    const items = node.children ?? [];
    if (
      isCollectionNode(node) &&
      items.length > 0 &&
      items.every((item) => (item.children ?? []).some((c) => isLeafPanelList(c)))
    ) {
      tabbed.add(node.id);
    }
    for (const child of items) findTabbed(child);
  };
  for (const root of roots) findTabbed(root);

  // 3. Hidden: panel-only lists, and the items of any panel-only or tabbed list.
  const hidden = new Set<string>(panelOnly);
  const hideItems = (node: StructureNode) => {
    if (panelOnly.has(node.id) || tabbed.has(node.id)) {
      for (const item of node.children ?? []) hidden.add(item.id);
    }
    for (const child of node.children ?? []) hideItems(child);
  };
  for (const root of roots) hideItems(root);
  // A panel-only list is hidden whole; its items (in `hidden`) go with it.
  return { hidden, tabbed };
}

// The ids hidden from the tree (see analyzePanel).
export function panelOnlyIds(roots: StructureNode[]): Set<string> {
  return analyzePanel(roots).hidden;
}

// The hidden lists a node shows inline in its Properties panel.
export function panelListsOf(node: StructureNode, panelIds: ReadonlySet<string>): StructureNode[] {
  return (node.children ?? []).filter((c) => panelIds.has(c.id));
}

// A product's panel name: its Product Title (what the card shows) once set, so
// the tab and header follow the title the author edits. The node label is the
// fallback; the tree can't rename a product now that products live in the panel.
export function panelItemTitle(node: StructureNode): string {
  if (node.objectType !== "product" && node.objectType !== "plan") return node.label;
  const title = node.content?.["Product Title"]?.trim();
  return title || node.label;
}

// Is this field the title that names its node? A category, plan or product's
// title, or a schema item's leading title-like field ("Category Title" on
// "Category 1", "Heading" on "Heading 1"). Editing it renames the node.
export function isNameField(node: StructureNode, label: string): boolean {
  if (node.objectType === "category" || node.objectType === "product" || node.objectType === "plan")
    return /^(Category|Product|Plan) Title$/.test(label);
  if (node.objectType === "schema-item") {
    const props = node.props;
    if (props?.kind !== "fields") return false;
    const fields = (props.data.groups ?? []).flatMap((g) => g.fields);
    const title = fields.find(
      (f) => /title|heading|name|question/i.test(f.label) && !/icon|image|logo|query|badge/i.test(f.label),
    );
    return !!title && label === title.label;
  }
  return false;
}
