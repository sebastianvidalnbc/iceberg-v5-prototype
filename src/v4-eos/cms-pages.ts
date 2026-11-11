// Merges the production page inventory (page-inventory/pages.txt, captured from the
// CMS Page List on stable-int) into the Pages tree.
//
// - Every production slug becomes a page node, nested under its longest
//   existing parent route (e.g. /offer/brandn sits under /offer).
// - Hand-built nodes that already match a production slug are kept (so their
//   variants and editor links survive) and annotated with real list metadata.
// - Hand-built routes that do not exist in production are left in place
//   without metadata. They are demo fixtures, not production copies.
import type { CmsPageMeta, StructureNode, TreeNode, VariantWorkspace } from "./data";
// The inventory lives in page-inventory/ (tracked, brand names replaced with dummy names). Without it the
// glob is empty and the Pages tree stays hand-built, so CI builds still pass.
const pagesRaw: string =
  (Object.values(
    import.meta.glob("./page-inventory/pages.txt", { query: "?raw", import: "default", eager: true }),
  )[0] as string | undefined) ?? "";

// The CMS "modified" column is relative to the date the list was read.
const CMS_READ_DATE = Date.UTC(2026, 10, 4, 18);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

interface InventoryRow {
  slug: string;
  status: "Draft" | "Published";
  visibility: "Visible" | "Hidden";
  created: string | null;
  modified: string | null;
}

function parseCreated(text: string): { label: string; ts: number } | null {
  // "Thu 24 Jul 25" → "Jul 24 25", ts for sorting.
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 4) return null;
  const [, day, mon, yy] = parts;
  const m = MONTHS.indexOf(mon);
  if (m < 0) return null;
  const year = 2000 + Number(yy);
  return { label: `${mon} ${day.padStart(2, "0")} ${yy}`, ts: Date.UTC(year, m, Number(day)) };
}

function relativeToTs(text: string): number | null {
  const m = /^(an?|\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/.exec(text.trim());
  if (!m) return null;
  const n = m[1] === "a" || m[1] === "an" ? 1 : Number(m[1]);
  return CMS_READ_DATE - n * UNIT_MS[m[2]];
}

export function parsePagesInventory(raw: string): InventoryRow[] {
  const rows: InventoryRow[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("slug|")) continue;
    const [slug, status, vis, created, modified] = line.split("|");
    rows.push({
      slug,
      status: status === "P" ? "Published" : "Draft",
      visibility: vis === "H" ? "Hidden" : "Visible",
      created: created?.trim() || null,
      modified: modified?.trim() || null,
    });
  }
  return rows;
}

export const CMS_PAGE_ROWS: InventoryRow[] = parsePagesInventory(pagesRaw);

function metaFor(row: InventoryRow): CmsPageMeta {
  const created = row.created ? parseCreated(row.created) : null;
  return {
    status: row.status,
    visibility: row.visibility,
    created: created?.label ?? null,
    createdAt: created?.ts ?? null,
    modified: row.modified,
    modifiedAt: row.modified ? relativeToTs(row.modified) : null,
  };
}

function nodeId(slug: string): string {
  return "cms" + slug.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "");
}

export function withCmsPages(tree: TreeNode[]): TreeNode[] {
  const roots = [...tree];
  const byLabel = new Map<string, TreeNode>();
  const index = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type !== "variant" && n.label.startsWith("/")) byLabel.set(n.label, n);
      if (n.children) index(n.children);
    }
  };
  index(tree);

  // Parents first: shorter slugs have fewer segments.
  const rows = [...CMS_PAGE_ROWS].sort(
    (a, b) => a.slug.split("/").length - b.slug.split("/").length,
  );

  // Every inventory page, hand-built or not, ends up here.
  const inventoryNodes: TreeNode[] = [];

  for (const row of rows) {
    const existing = byLabel.get(row.slug);
    if (existing) {
      existing.cms = metaFor(row);
      inventoryNodes.push(existing);
      continue;
    }
    // Longest existing ancestor route, by path segment.
    const segs = row.slug.split("/");
    let parent: TreeNode | undefined;
    for (let i = segs.length - 1; i > 1 && !parent; i--) {
      parent = byLabel.get(segs.slice(0, i).join("/"));
    }
    const node: TreeNode = {
      id: nodeId(row.slug),
      label: row.slug,
      type: "page",
      kind: "path",
      cms: metaFor(row),
    };
    if (parent) parent.children = [...(parent.children ?? []), node];
    else roots.push(node);
    byLabel.set(row.slug, node);
    inventoryNodes.push(node);
  }

  // The CMS capture has no page content, so each inventory page without a real
  // variant gets one placeholder variant (see placeholderVariants).
  for (const node of inventoryNodes) {
    if (node.children?.some((c) => c.type === "variant")) continue;
    node.children = [
      ...(node.children ?? []),
      { id: placeholderId(node.id), label: "Placeholder", type: "variant" },
    ];
  }
  return roots;
}

const PLACEHOLDER_PREFIX = "ph-";

export function placeholderId(routeId: string): string {
  return PLACEHOLDER_PREFIX + routeId;
}

// A labelled Title + Footer skeleton. It says what it is, so authors never
// mistake it for captured content.
function placeholderWorkspace(id: string, pageLabel: string): VariantWorkspace {
  const structure: StructureNode[] = [
    { id: `${id}-title`, label: "Title", objectType: "page-section", role: "Page Title" },
    { id: `${id}-footer`, label: "Footer", objectType: "page-section", role: "Footer" },
  ];
  return {
    id,
    name: "Placeholder",
    structure,
    previewData: {
      title: pageLabel,
      subtitle: "Placeholder · no captured content",
      tone: "neutral",
      body: "The CMS capture has no content for this page. Title and Footer are placeholders only.",
    },
    defaultSelectionId: structure[0].id,
  };
}

// Workspaces for every placeholder variant under the tree. Registered into VARIANTS.
export function placeholderVariants(
  tree: TreeNode[],
  out: Record<string, VariantWorkspace> = {},
): Record<string, VariantWorkspace> {
  for (const node of tree) {
    for (const child of node.children ?? []) {
      if (child.type === "variant" && child.id.startsWith(PLACEHOLDER_PREFIX)) {
        out[child.id] = placeholderWorkspace(child.id, node.label);
      }
    }
    if (node.children) placeholderVariants(node.children, out);
  }
  return out;
}
