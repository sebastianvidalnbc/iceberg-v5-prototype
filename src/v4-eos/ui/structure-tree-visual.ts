import type { StructureNode } from "@/v4-eos/data";

/** V4 Structure tree presentation — maps domain types to layers-panel cues. */
export type StructureLabelWeight = "regular" | "medium";

export interface StructureNodeVisual {
  labelWeight: StructureLabelWeight;
  /** Extra space above top-level page sections (major group break). */
  sectionBreak?: boolean;
  /** Secondary label colour: alternatives to the anchor row. */
  muted?: boolean;
}

const COLLECTION_TYPES = new Set([
  "section-content",
  "content-area",
  "products",
  "plan-picker-data",
  "categories",
  "variant-categories",
  "product-features-list",
  "price-cadence",
  "pricing",
  "offers",
  "segmentation",
  "survey-responses",
  "schema-collection",
  "segment-names",
]);

export function getStructureNodeVisual(
  node: StructureNode,
  ctx: { depth: number; index: number; parentId: string | null },
): StructureNodeVisual {
  const t = node.objectType;
  const hasKids = Boolean(node.children?.length);

  if (t === "page-section") {
    return {
      labelWeight: "medium",
      sectionBreak: ctx.parentId === null && ctx.index > 0,
    };
  }
  if (t === "variation") {
    // A/B alternatives sit beside the Control. Control is the anchor (medium);
    // the other variations are muted. Matched by label, the same convention as
    // data.ts control schemas.
    if (["control", "default/control"].includes(node.label.trim().toLowerCase())) {
      return { labelWeight: "medium" };
    }
    return { labelWeight: "regular", muted: true };
  }
  if (t === "section-options") {
    return { labelWeight: "regular" };
  }
  if (t === "behaviours") {
    return { labelWeight: "regular" };
  }
  if (t === "content-block") {
    return { labelWeight: "regular" };
  }
  if (t === "widget-config" || t === "journey-flows") {
    return { labelWeight: "medium" };
  }
  if (t === "offer-group" || t === "segmentation-group") {
    return { labelWeight: "medium" };
  }
  if (t === "segmentation-category") {
    return { labelWeight: "medium" };
  }
  if (COLLECTION_TYPES.has(t ?? "")) {
    return { labelWeight: "medium" };
  }
  if (t === "product" || t === "plan") {
    return { labelWeight: "regular" };
  }
  if (t === "feature" || t === "cadence" || t === "pricing-option" || t === "offer") {
    return { labelWeight: "regular" };
  }
  if (t === "survey-response" || t === "segment-name") {
    return { labelWeight: "regular" };
  }
  if (hasKids) {
    return { labelWeight: "medium" };
  }
  return { labelWeight: "regular" };
}

/** Production form headings are primary; nested tab/copy groups are secondary. */
export function getContentPageOutlineVisual(
  _id: string,
  ctx: { depth: number },
): StructureNodeVisual {
  return { labelWeight: ctx.depth === 0 ? "medium" : "regular" };
}
