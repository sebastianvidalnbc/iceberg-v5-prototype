// Representative V2 Variant workspaces. SAMPLE DATA — deliberately simplified
// and NOT a byte-for-byte reproduction of production Iceberg content. Each
// Variant owns its own Structure tree, preview state, and default selection so
// the prototype demonstrates that different Variants have different structures.
import type {
  SectionDesign,
  SectionRole,
  StructureNode,
  StructureObjectType,
  VariantWorkspace,
} from "./data";
import { FEATURES } from "./layout-samples";

// Small helper to cut down on repetition when authoring sample trees.
const n = (
  id: string,
  label: string,
  children?: StructureNode[],
  expanded = true
): StructureNode => ({
  id,
  label,
  ...(children ? { children, defaultExpanded: expanded } : {}),
});

// Metadata-carrying node helper for the canonical 0609 Variant, where each
// object is tagged with its objectType (and, for Page Sections, sectionId +
// design) so Properties resolution is type-aware rather than label-guessed.
const nt = (
  id: string,
  label: string,
  objectType: StructureObjectType,
  opts: {
    children?: StructureNode[];
    expanded?: boolean;
    sectionId?: string;
    design?: SectionDesign;
    role?: SectionRole;
  } = {}
): StructureNode => ({
  id,
  label,
  objectType,
  ...(opts.sectionId ? { sectionId: opts.sectionId } : {}),
  ...(opts.design ? { design: opts.design } : {}),
  ...(opts.role ? { role: opts.role } : {}),
  ...(opts.children
    ? { children: opts.children, defaultExpanded: opts.expanded ?? true }
    : {}),
});

// Top-level Sections get the same objectType + role as the canonical 0609 so the
// Structure Explorer draws their layout region (colour, side label, gutter).
const section = (node: StructureNode, role: SectionRole): StructureNode => ({
  ...node,
  objectType: "page-section",
  role,
});

// A product's feature bullets as a panel-only list (hidden from the tree, shown
// in the Properties panel), filled with the same bullets the Layout Picker uses.
const featureList = (prefix: string, texts: string[]): StructureNode =>
  nt(`${prefix}-features`, "Product Features", "product-features-list", {
    children: texts.map((text, i) => nt(`${prefix}-feat-${i + 1}`, text, "feature")),
  });

// --- Spanish voucher error message ------------------------------------------
const spanishStructure: StructureNode[] = [
  section(n("sv-title", "Title"), "Page Title"),
  section(n("sv-voucher-error", "Voucher Error"), "Voucher Error"),
  section(n("sv-legal", "Legal"), "Footer"),
];

// --- Testing disclaimer 2 ---------------------------------------------------
const disclaimerStructure: StructureNode[] = [
  section(n("td-title", "Title"), "Page Title"),
  section(n("td-card", "Premium card first test", [
    n("td-section-content", "Section Content", [
      n("td-control", "Control", [
        n("td-variant-categories", "Variant Categories", [
          n("td-plans", "Plans", [
            nt("td-plan-picker-data", "Plan Picker Data", "plan-picker-data", {
              children: [
                nt("td-premium", "Premium", "product", {
                  children: [featureList("td-premium", FEATURES.slice(0, 3))],
                }),
              ],
            }),
          ]),
        ]),
      ]),
    ]),
    n("td-section-options", "Section Options", []),
    n("td-disclaimer", "Disclaimer"),
  ]), "Plan Picker"),
  section(n("td-legal", "Legal"), "Footer"),
];

// --- Annual Select Update ---------------------------------------------------
const annualStructure: StructureNode[] = [
  section(n("as-title", "Title"), "Page Title"),
  section(n("as-plan-picker", "Plan Picker", [
    n("as-section-content", "Section Content", [
      n("as-control", "Control", [
        n("as-variant-categories", "Variant Categories", [
          n("as-plans", "Plans", [
            nt("as-plan-picker-data", "Plan Picker Data", "plan-picker-data", {
              children: [
                nt("as-premium", "Premium", "product", {
                  children: [featureList("as-premium", FEATURES.slice(0, 3))],
                }),
                nt("as-premium-plus", "Premium Plus", "product", {
                  children: [featureList("as-premium-plus", FEATURES.slice(3))],
                }),
              ],
            }),
          ]),
        ]),
      ]),
    ]),
    n("as-section-options", "Section Options", []),
  ]), "Plan Picker"),
  section(n("as-legal", "Legal"), "Footer"),
];

// --- 0609 premium card test 2 (the canonical, architect-aligned sample) -----
// Three top-level Sections carrying explicit ROLES (Page Title / Plan Picker /
// Footer) distinct from their authored labels. Real Iceberg authoring wrappers
// are preserved: the Plan Picker section's Section Content holds the
// Predecision & Control variations; Control owns the content hierarchy
// Categories → Category → Products → Product → (Product Features / Price
// Cadence). Page Title & Footer are Custom sections with Content Areas +
// Section Options + Behaviours.
const premiumCardStructure: StructureNode[] = [
  nt("pc-title", "Title", "page-section", {
    sectionId: "section-1",
    role: "Page Title",
    design: "Custom",
    children: [
      nt("pc-title-desktop", "Desktop Content", "content-area"),
      nt("pc-title-mobile", "Mobile Content", "content-area"),
      nt("pc-title-section-options", "Section Options", "section-options", {
        design: "Custom",
      }),
      nt("pc-title-behaviours", "Behaviours", "behaviours"),
    ],
  }),
  nt("pc-card", "Premium card first test", "page-section", {
    sectionId: "section-2",
    role: "Plan Picker",
    design: "Intelligent authoring",
    children: [
      nt("pc-section-content", "Section Content", "section-content", {
        children: [
          nt("pc-predecision", "Predecision", "variation"),
          nt("pc-control", "Control", "variation", {
            children: [
              nt("pc-categories", "Categories", "categories", {
                children: [
                  nt("pc-plans", "Plans", "category", {
                    children: [
                      nt("pc-products", "Products", "products", {
                        children: [
                          nt("pc-select", "Select", "product", {
                            expanded: false,
                            children: [featureList("pc-select", FEATURES.slice(0, 3))],
                          }),
                          nt("pc-premium", "Premium", "product", {
                            children: [
                              nt("pc-product-features", "Product Features", "product-features-list", {
                                children: [
                                  nt("pc-feat-tv", "TV Favorites from NBC, Bravo & More", "feature"),
                                  nt("pc-feat-sports", "Live Sports", "feature"),
                                  nt("pc-feat-downloads", "Downloads", "feature"),
                                ],
                              }),
                              nt("pc-price-cadence", "Price Cadence", "price-cadence", {
                                children: [
                                  nt("pc-cad-annual", "Annual", "cadence"),
                                  nt("pc-cad-monthly", "Monthly", "cadence"),
                                ],
                              }),
                            ],
                          }),
                          nt("pc-premium-plus", "Premium Plus", "product", {
                            expanded: false,
                            children: [featureList("pc-pplus", FEATURES.slice(3))],
                          }),
                        ],
                      }),
                    ],
                  }),
                  nt("pc-bundles", "Bundles", "category", {
                    expanded: false,
                    children: [
                      nt("pc-bundles-products", "Products", "products"),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      nt("pc-section-options", "Section Options", "section-options", {
        design: "Intelligent authoring",
      }),
    ],
  }),
  nt("pc-footer", "Footer", "page-section", {
    sectionId: "section-3",
    role: "Footer",
    design: "Custom",
    children: [
      nt("pc-footer-desktop", "Desktop Content", "content-area"),
      nt("pc-footer-mobile", "Mobile Content", "content-area"),
      nt("pc-footer-section-options", "Section Options", "section-options", {
        design: "Custom",
      }),
      nt("pc-footer-behaviours", "Behaviours", "behaviours"),
    ],
  }),
];

// --- Premium_Test__2 --------------------------------------------------------
const premiumTest2Structure: StructureNode[] = [
  section(n("pt-title", "Title"), "Page Title"),
  section(n("pt-plan-picker", "Premium Plan Picker", [
    n("pt-section-content", "Section Content", [
      n("pt-control", "Control", [
        n("pt-variant-categories", "Variant Categories", [
          n("pt-plans", "Plans", [
            nt("pt-plan-picker-data", "Plan Picker Data", "plan-picker-data", {
              children: [
                nt("pt-premium", "Premium", "product", {
                  children: [featureList("pt-premium", FEATURES.slice(0, 3))],
                }),
                nt("pt-premium-plus", "Premium Plus", "product", {
                  children: [featureList("pt-premium-plus", FEATURES.slice(3))],
                }),
              ],
            }),
          ]),
        ]),
      ]),
    ]),
    n("pt-section-options", "Section Options", []),
  ]), "Plan Picker"),
  section(n("pt-faq", "FAQ"), "FAQ's"),
];

export const VARIANT_STRUCTURES: Record<string, StructureNode[]> = {
  "pg-spanish": spanishStructure,
  "pg-disclaimer2": disclaimerStructure,
  "pg-annual": annualStructure,
  "pg-0609": premiumCardStructure,
  "pg-premium-test-2": premiumTest2Structure,
};

// Re-exported so data.ts can assemble the full VariantWorkspace records.
export type { VariantWorkspace };
