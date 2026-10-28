// Per-Variant preview state and property schemas. SAMPLE DATA — representative
// only. The point is that switching Variants visibly changes the preview and
// the Properties, not production fidelity.
import type {
  ObjectProperties,
  PreviewData,
  ResolvedProperties,
  SectionDesign,
} from "./data";
import { LEGAL, PLAN_DESCRIPTIONS } from "./layout-samples";

// --- Preview data (center canvas) -------------------------------------------
export const VARIANT_PREVIEWS: Record<string, PreviewData> = {
  "pg-spanish": {
    title: "Mensaje de error de cupón",
    subtitle: "Voucher Error",
    tone: "error",
    body: "El código de cupón no es válido o ha caducado. Inténtalo de nuevo.",
  },
  "pg-disclaimer2": {
    title: "Testing disclaimer 2",
    subtitle: "Disclaimer treatment",
    tone: "neutral",
    body: "Single-card layout with an expanded legal disclaimer beneath the plan.",
  },
  "pg-annual": {
    title: "Annual Select Update",
    subtitle: "Plan Picker — 2 plans",
    tone: "plans",
    body: "Premium and Premium Plus shown side by side with annual pricing emphasis.",
  },
  "pg-0609": {
    title: "0609 premium card test 2",
    subtitle: "Plan Picker — 3 plans",
    tone: "plans",
    body: "Select, Premium (Best Value), and Premium Plus with feature lists and pricing.",
  },
  "pg-premium-test-2": {
    title: "Premium_Test__2",
    subtitle: "Premium Plan Picker — 2 plans",
    tone: "plans",
    body: "Trimmed plan picker showing Premium and Premium Plus only.",
  },
};

// --- Default Structure selection per Variant --------------------------------
export const VARIANT_DEFAULT_SELECTION: Record<string, string> = {
  "pg-spanish": "sv-voucher-error",
  "pg-disclaimer2": "td-disclaimer",
  "pg-annual": "as-plans",
  "pg-0609": "pc-premium",
  "pg-premium-test-2": "pt-plan-picker",
};

// --- TYPE-keyed schema templates --------------------------------------------
// Generic field schemas keyed by object TYPE, using EXACT confirmed V1 labels
// and the real fields visible in the Iceberg screenshots. These give every
// non-authored node a meaningful field set. Explicit OBJECT_PROPERTIES[nodeId]
// (and per-node authored props) take precedence.

const ALIGNMENTS = ["Left", "Centre", "Right"];
const PICK_VARIANTS = ["Button Variant", "Card Variant", "Compact Variant"];
const BACKGROUNDS = ["None", "Dark", "Light", "Transparent"];
const CTA_CHOICES = ["None", "Primary", "Secondary"];
const LEGAL_TYPES = ["None", "Standard", "Custom"];

// Control (and other content variations). Real V1 fields, grouped under an
// ACCESSIBILITY header for the region toggle to keep the panel scannable.
export function controlSchema(label: string): ObjectProperties {
  return {
    eyebrow: "CONTENT VARIATION",
    name: label,
    groups: [
      {
        header: "ACCESSIBILITY",
        fields: [
          {
            label: "Include this section as a region",
            value: "true",
            kind: "checkbox",
            helper: "Exposes the section as an ARIA landmark region.",
          },
        ],
      },
      {
        header: "CONTENT",
        fields: [
          { label: "Plan Picker Title", value: "Pick a Plan. Cancel Anytime." },
          { label: "Subtitle", value: "" },
          {
            label: "Title & Subtitle Alignment",
            value: "Centre",
            kind: "select",
            options: ALIGNMENTS,
          },
          {
            label: "Enable Horizontal Scroll on Mobile",
            value: "false",
            kind: "checkbox",
          },
          {
            label: "Pick Variant",
            value: "Button Variant",
            kind: "select",
            options: PICK_VARIANTS,
          },
        ],
      },
    ],
  };
}

// Section Options has two real shapes depending on the section's Design mode.
// Custom → the layout/whitespace field list (screenshots 3–4).
// Intelligent authoring → the variant-name list (screenshot 8).
export function sectionOptionsSchema(design?: SectionDesign): ObjectProperties {
  if (design === "Intelligent authoring") {
    return {
      eyebrow: "SECTION OPTIONS",
      name: "Section Options",
      fields: [
        { label: "Label", value: "Premium card first test" },
        { label: "Type", value: "Modules" },
        { label: "Control / Default Variant - Name", value: "Control" },
        { label: "Variant A - Name", value: "Variant A" },
        { label: "Variant B - Name", value: "" },
        { label: "Variant C - Name", value: "" },
      ],
    };
  }
  return {
    eyebrow: "SECTION OPTIONS",
    name: "Section Options",
    groups: [
      {
        fields: [
          { label: "Label", value: "Title" },
          { label: "Type", value: "Modules" },
          { label: "Activate Tablet View", value: "false", kind: "switch" },
        ],
      },
      {
        header: "LAYOUT",
        fields: [
          { label: "Make section Full Width", value: "false", kind: "checkbox" },
          { label: "Hide section", value: "false", kind: "checkbox" },
          {
            label: "Include Vertical Whitespace (Gutters)",
            value: "false",
            kind: "checkbox",
          },
          {
            label: "Include Horizontal Whitespace",
            value: "false",
            kind: "checkbox",
          },
          {
            label: "Section Background Colour",
            value: "None",
            kind: "select",
            options: BACKGROUNDS,
          },
          {
            label: "Placeholder Vertical Alignment",
            value: "Top",
            kind: "select",
            options: ["Top", "Centre", "Bottom"],
          },
          {
            label: "Section Overlap Size",
            value: "None",
            kind: "select",
            options: ["None", "Small", "Medium", "Large"],
          },
          {
            label: "Rounded Corners",
            value: "None",
            kind: "select",
            options: ["None", "Small", "Medium", "Large"],
          },
          {
            label: "Inner Padding for Devices",
            value: "Default",
            kind: "select",
            options: ["Default", "Compact", "Spacious"],
          },
        ],
      },
    ],
  };
}

// Content block — the editable field set behind the premade content layouts
// (Hero / Banner / Content promo / FAQ) added via the Layout Picker. Title feeds
// the preview's section band; Subtitle + a single CTA round out the module. The
// authored VALUES arrive on the instance's `content` (seeded by the layout).
export function contentBlockSchema(label: string): ObjectProperties {
  return {
    eyebrow: "CONTENT",
    name: label,
    groups: [
      {
        header: "CONTENT",
        fields: [
          { label: "Title", value: "", required: true },
          { label: "Subtitle", value: "", kind: "textarea" },
          {
            label: "Title & Subtitle Alignment",
            value: "Centre",
            kind: "select",
            options: ALIGNMENTS,
          },
        ],
      },
      {
        header: "CTA",
        fields: [
          {
            label: "Primary CTA",
            value: "None",
            kind: "select",
            options: CTA_CHOICES,
          },
          { label: "Primary CTA Text", value: "" },
          { label: "Primary CTA HREF", value: "" },
        ],
      },
    ],
  };
}

export function categorySchema(label: string): ObjectProperties {
  return {
    eyebrow: "VARIANT CATEGORY",
    name: label,
    fields: [
      { label: "Category Title", value: label, required: true },
      { label: "Category Query Parameter", value: label.toLowerCase() },
    ],
  };
}

// Authored values for a Product. Every field is optional; unset fields render
// empty. This is DATA supplied by the selected object — the editor SCHEMA
// (productSchema) is identical for every Product regardless of these values.
export interface ProductValues {
  badge: boolean;
  badgeText: string;
  eyebrow: string;
  productTitleIcon: string;
  productLogo: string;
  productTitle: string;
  productDescription: string;
  // Pricing (schema single-price model, authored on the card).
  offerDetail: string;
  strikeThroughPrice: string;
  offerPrice: string;
  priceCadenceSubtext: string;
  priceAria: string;
  offerDetailDescription: string;
  primaryCta: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  voucherErrorText: string;
  productId: string;
  voucherId: string;
  removeProductId: boolean;
  removeVoucherId: boolean;
  maintainQueryParams: boolean;
  legal: string;
  legalDescription: string;
}

// Product editor. Schema-driven and identical for Select / Premium / Premium
// Plus — the object supplies VALUES, the `product` type supplies this SCHEMA.
// Groups: CONTENT / PRICING / CTA / COMMERCE·CONFIGURATION / LEGAL. Pricing
// fields (Offer Price, Strike Through Price, cadence subtext, …) live on the
// card per the schema's single-price Plan Picker product. Product Features
// remain a child collection in Structure; any legacy Price Cadence collection
// still feeds the preview as a fallback when the card fields are empty.
export function productSchema(
  label: string,
  values: Partial<ProductValues> = {}
): ObjectProperties {
  const v = values;
  const bool = (x?: boolean) => (x ? "true" : "false");
  return {
    eyebrow: "PRODUCT",
    name: label,
    groups: [
      {
        header: "CONTENT",
        fields: [
          {
            label: "Badge",
            value: bool(v.badge),
            kind: "checkbox",
            helper: "Show a badge on this product.",
          },
          { label: "Badge Text", value: v.badgeText ?? "" },
          { label: "Eyebrow", value: v.eyebrow ?? "" },
          { label: "Product Title Icon", value: v.productTitleIcon ?? "", kind: "asset" },
          { label: "Product Logo", value: v.productLogo ?? "", kind: "asset" },
          { label: "Product Title", value: v.productTitle ?? label, required: true },
          {
            label: "Product Description",
            value: v.productDescription ?? "",
            kind: "textarea",
          },
        ],
      },
      {
        header: "PRICING",
        fields: [
          {
            label: "Offer Detail",
            value: v.offerDetail ?? "",
            helper: "Savings eyebrow, e.g. \u201cSave 30%\u201d.",
          },
          { label: "Strike Through Price", value: v.strikeThroughPrice ?? "" },
          { label: "Offer Price", value: v.offerPrice ?? "" },
          {
            label: "Price Cadence and Subtext",
            value: v.priceCadenceSubtext ?? "",
            helper: "Cadence + subtext, e.g. \u201c/month\u201d.",
          },
          { label: "Price Aria Label", value: v.priceAria ?? "" },
          {
            label: "Offer Detail Description",
            value: v.offerDetailDescription ?? "",
            kind: "textarea",
          },
        ],
      },
      {
        header: "CTA",
        fields: [
          {
            label: "Primary CTA",
            value: v.primaryCta ?? "None",
            kind: "select",
            options: CTA_CHOICES,
          },
          { label: "Primary CTA Text", value: v.primaryCtaText ?? "" },
          { label: "Primary CTA HREF", value: v.primaryCtaHref ?? "" },
        ],
      },
      {
        header: "COMMERCE / CONFIGURATION",
        fields: [
          {
            label: "Voucher Error Text",
            value: v.voucherErrorText ?? "",
            kind: "textarea",
          },
          { label: "Product ID", value: v.productId ?? "" },
          { label: "Voucher ID", value: v.voucherId ?? "" },
          { label: "Remove Product ID", value: bool(v.removeProductId), kind: "checkbox" },
          { label: "Remove Voucher ID", value: bool(v.removeVoucherId), kind: "checkbox" },
          {
            label: "Maintain Query Parameters",
            value: bool(v.maintainQueryParams),
            kind: "checkbox",
          },
        ],
      },
      {
        header: "LEGAL",
        fields: [
          {
            label: "Legal",
            value: v.legal ?? "None",
            kind: "select",
            options: LEGAL_TYPES,
          },
          { label: "Legal Description", value: v.legalDescription ?? "", kind: "textarea" },
        ],
      },
    ],
  };
}

// Product Feature. Architect field names: Feature Icon + Feature Description.
export function featureSchema(label: string): ObjectProperties {
  return {
    eyebrow: "PRODUCT FEATURE",
    name: label,
    fields: [
      { label: "Feature Icon", value: "check", kind: "asset" },
      { label: "Feature Description", value: label, kind: "textarea", required: true },
    ],
  };
}

// Cadence (a single Price Cadence item). Real V1 PricingOption fields
// (offerDetail, buttonDescription, previousPrice→Strikethrough Price, ariaLabel)
// plus the prototype's Offer Price and a per-cadence CTA group.
export function cadenceSchema(label: string): ObjectProperties {
  return {
    eyebrow: "PRICE CADENCE",
    name: label,
    groups: [
      {
        header: "PRICING",
        fields: [
          { label: "Offer Detail", value: "" },
          { label: "Button Description", value: "", kind: "textarea" },
          { label: "Strikethrough Price", value: "" },
          { label: "Offer Price", value: "" },
          { label: "Aria Label", value: label, required: true },
        ],
      },
      {
        header: "CTA",
        fields: [
          {
            label: "Primary CTA",
            value: "None",
            kind: "select",
            options: CTA_CHOICES,
          },
          { label: "Primary CTA Text", value: "" },
          { label: "Primary CTA HREF", value: "" },
        ],
      },
    ],
  };
}

// Desktop / Mobile Content — a meaningful representation of the configured
// module (real Iceberg shows a grid; we surface the configured module here).
export function contentAreaSchema(label: string): ResolvedProperties {
  return {
    kind: "fields",
    data: {
      eyebrow: label.toUpperCase(),
      name: label,
      fields: [
        {
          label: "Configured Module",
          value: "NS - S-64afd60a-4d14-42ea-b12d-a7e872b23577",
          kind: "select",
          options: [
            "NS - S-64afd60a-4d14-42ea-b12d-a7e872b23577",
            "NS - Title Text",
          ],
          helper: "The module currently placed in this content area.",
        },
        {
          label: "Columns",
          value: label.toLowerCase().includes("mobile") ? "4" : "12",
          kind: "select",
          options: ["4", "12"],
        },
      ],
    },
  };
}

// Behaviours — a deliberate, minimal state (real Iceberg shows a single
// behaviour selector, screenshot 5). We do not invent a large schema.
export function behavioursState(sectionName: string): ResolvedProperties {
  return {
    kind: "fields",
    data: {
      eyebrow: "BEHAVIOURS",
      name: sectionName,
      fields: [
        {
          label: "Behaviour",
          value: "None",
          kind: "select",
          options: ["None"],
          helper: "No behaviour configured for this section.",
        },
      ],
    },
  };
}

// --- Property schemas per Structure object ----------------------------------
// Keyed by structure node id. Only objects with authored fields appear here;
// everything else falls back to a name-only panel (see data.ts).
// A plan card with a working CTA, a standard legal line and the sample copy from
// the Layout Picker. Used by the sample Variants so their plans read as filled.
function pricedPlan(label: string, values: Partial<ProductValues>): ObjectProperties {
  return productSchema(label, {
    primaryCta: "Primary",
    primaryCtaText: "Get started",
    primaryCtaHref: "/checkout",
    legal: "Standard",
    legalDescription: LEGAL,
    ...values,
  });
}

export const OBJECT_PROPERTIES: Record<string, ObjectProperties> = {
  // 0609 premium card test 2 → Premium. Uses the SAME productSchema as every
  // other Product; only the VALUES are authored here (badge, description, …).
  "pc-premium": productSchema("Premium", {
    badge: true,
    badgeText: "Best Value",
    productLogo: "peacock-logo",
    productTitle: "Premium",
    productDescription:
      "Stream hit movies, bingeworthy shows, and live sports — plus new series the day after they air.",
    offerPrice: "$12.99",
    priceCadenceSubtext: "/month",
    primaryCta: "Primary",
    primaryCtaText: "Get started",
    primaryCtaHref: "/checkout",
    legal: "Custom",
    legalDescription:
      "Compatible device and internet connection required. Auto-renews monthly at the then-current price until canceled. Live sports subject to regional and blackout restrictions. Terms apply.",
  }),
  // 0609 → Select and Premium Plus: same card schema, filled from the sample plans.
  "pc-select": pricedPlan("Select", {
    productDescription: PLAN_DESCRIPTIONS[0],
    offerPrice: "$5.99",
    priceCadenceSubtext: "/month",
  }),
  "pc-premium-plus": pricedPlan("Premium Plus", {
    productDescription: PLAN_DESCRIPTIONS[1],
    offerPrice: "$19.99",
    priceCadenceSubtext: "/month",
  }),
  // Annual Select Update → Premium and Premium Plus, priced annually with a saving.
  "as-premium": pricedPlan("Premium", {
    badge: true,
    badgeText: "Best Value",
    productDescription: PLAN_DESCRIPTIONS[0],
    offerDetail: "Save 17%",
    strikeThroughPrice: "$155.88",
    offerPrice: "$129.99",
    priceCadenceSubtext: "/year",
  }),
  "as-premium-plus": pricedPlan("Premium Plus", {
    productDescription: PLAN_DESCRIPTIONS[1],
    offerDetail: "Save 17%",
    strikeThroughPrice: "$239.88",
    offerPrice: "$199.99",
    priceCadenceSubtext: "/year",
  }),
  // Premium_Test__2 → Premium and Premium Plus, priced monthly.
  "pt-premium": pricedPlan("Premium", {
    productDescription: PLAN_DESCRIPTIONS[0],
    offerPrice: "$12.99",
    priceCadenceSubtext: "/month",
  }),
  "pt-premium-plus": pricedPlan("Premium Plus", {
    productDescription: PLAN_DESCRIPTIONS[1],
    offerPrice: "$19.99",
    priceCadenceSubtext: "/month",
  }),
  // Testing disclaimer 2 → single Premium card. The disclaimer below carries the
  // legal copy, so the card has no legal line of its own.
  "td-premium": pricedPlan("Premium", {
    productDescription: PLAN_DESCRIPTIONS[0],
    offerPrice: "$12.99",
    priceCadenceSubtext: "/month",
    legal: "None",
    legalDescription: "",
  }),
  // Spanish voucher error message → Voucher Error
  "sv-voucher-error": {
    eyebrow: "ERROR MESSAGE",
    name: "Voucher Error",
    fields: [
      { label: "Error Title", value: "Cupón no válido", required: true },
      {
        label: "Error Body",
        value: "El código de cupón no es válido o ha caducado.",
        kind: "textarea",
      },
      { label: "Retry CTA Label", value: "Inténtalo de nuevo" },
    ],
  },
  // Testing disclaimer 2 → Disclaimer
  "td-disclaimer": {
    eyebrow: "SECTION CONTENT",
    name: "Disclaimer",
    fields: [
      { label: "Show Disclaimer", value: "true", kind: "checkbox" },
      {
        label: "Disclaimer Text",
        value:
          "Compatible device and Peacock account required. Live sports subject to regional availability.",
        kind: "textarea",
      },
    ],
  },
  // Annual Select Update → Plans
  "as-plans": {
    eyebrow: "VARIANT CATEGORIES",
    name: "Plans",
    fields: [
      { label: "Category Label", value: "Choose your plan", required: true },
      { label: "Billing Cadence", value: "Annual" },
      { label: "Highlight Best Value", value: "true", kind: "checkbox" },
    ],
  },
  // Premium_Test__2 → Premium Plan Picker
  "pt-plan-picker": {
    eyebrow: "SECTION CONTENT",
    name: "Premium Plan Picker",
    fields: [
      { label: "Header", value: "Pick your Premium plan", required: true },
      { label: "Plan Count", value: "2" },
      {
        label: "Subheader",
        value: "Compare Premium and Premium Plus.",
        kind: "textarea",
      },
    ],
  },
};
