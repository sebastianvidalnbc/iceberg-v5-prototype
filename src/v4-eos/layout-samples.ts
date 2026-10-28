// Sample content for a layout as it is added from the Layout Picker, so a new
// section lands looking like the design (named plans, prices, badges, bullets)
// instead of empty fields. Values are written into each field's default and
// the rest is still editable. Matching is by field label, in priority order:
// the first rule that matches decides, and anything unmatched stays empty.
import type { PropertyField, StructureNode } from "./data";
import { isNameField } from "./structure-panel";

const PLAN_NAMES = ["Premium", "Premium Plus", "Premium Plus Ad-Free"];
const PLAN_PRICES = ["$5.99", "$12.99", "$12.99"];
const STRIKE_PRICES = ["$9.99", "$14.99", "$14.99"];
const BADGES = ["Most popular", "Best value", "Best value"];
const CADENCES = ["Monthly", "Annual"];
const FEATURES = [
  "Access to thousands of hours of content",
  "Stream on multiple devices",
  "Download content for offline viewing",
  "Ad-free streaming",
  "Everything in Premium",
  "Exclusive Peacock Originals",
];
const PLAN_DESCRIPTIONS = [
  "Stream thousands of shows and movies with limited ads.",
  "Everything in Premium, plus ad-free streaming and exclusive Originals.",
  "Everything in Premium Plus, with no ads at all.",
];
const CATEGORY_NAMES = ["Plans", "Bundles", "Offers"];
const CADENCE_PRICES = ["$5.99/month", "$59.99/year"];
const SEO_HEADINGS = ["Shows & movies", "Sports", "Account"];
const SEO_LINKS = ["Premium plans", "Help center", "Privacy"];
const SECTION_HEADINGS: Record<string, string> = {
  hero: "Stream the best of Peacock",
  "content-banner": "Stream the best of Peacock",
  faqs: "Frequently asked questions",
  carousel: "Trending now",
  "content-grid": "Popular right now",
  "cast-layout": "Cast & crew",
};
const FAQ_QUESTIONS = ["What is included?", "Can I cancel anytime?", "Which devices can I use?"];
const FAQ_ANSWERS = [
  "Thousands of hours of shows, movies and live sports, with limited ads on Premium.",
  "Yes. Cancel anytime from your account settings and keep access until the end of the billing period.",
  "Stream on your phone, tablet, computer and TV, on multiple devices at once.",
];
const GENERIC_DESCRIPTION = "Stream the latest shows, movies and live sports, all in one place.";
const LEGAL =
  "Offer subject to terms and conditions. Plans renew automatically until cancelled. Terms apply.";
const VOUCHER_ERROR = "This code can't be applied. Check the code and try again.";
const PLAN_HEADING = "Pick a Plan. Cancel Anytime.";

const pick = <T,>(list: T[], index: number): T => list[index % list.length];

interface SampleContext {
  planish: boolean;
  // Position of the field's owning node among its siblings (plan 1, 2, 3…).
  index: number;
  isItem: boolean;
  sectionTitle: string;
}

// The sample value for one field, or null to leave it empty.
export function sampleFor(label: string, ctx: SampleContext): string | null {
  const l = label.toLowerCase();
  const { index, planish } = ctx;

  if (/voucher error/.test(l)) return VOUCHER_ERROR;
  if (/legal|disclaimer|terms/.test(l)) return LEGAL;
  if (/href|url/.test(l)) return "/plans";
  // Ids, icons and images, aria and alt text, query params, and choice or
  // configuration controls: never sample these.
  if (
    /aria|\balt\b|alt tag|icon|image|logo|asset|upload|video|svg|background|\bid\b|remove|query|maintain|parameter|suffix|symbol|font|orientation|alignment|embed|display|enable|toggle|check|choose|select|type|template|tier|variant|field|metadata|'/.test(
      l,
    )
  )
    return null;
  if (/cta|button|call to action|link text/.test(l)) return planish ? "Get started" : "Learn more";
  if (/offer detail/.test(l) && /description|rte/.test(l)) return GENERIC_DESCRIPTION;
  if (/offer detail/.test(l)) return "Save 25%";
  if (/\brte\b|description/.test(l)) return planish ? pick(PLAN_DESCRIPTIONS, index) : GENERIC_DESCRIPTION;
  if (/previous|strike/.test(l)) return pick(STRIKE_PRICES, index);
  if (/badge/.test(l)) return pick(BADGES, index);
  if (/cadence/.test(l) && /subtext|title|label|billing/.test(l)) return pick(CADENCES, index);
  if (/cadence/.test(l) && !/price/.test(l)) return pick(CADENCES, index);
  if (/price/.test(l)) return pick(PLAN_PRICES, index);
  if (/eyebrow|kicker/.test(l)) return planish ? "Premium plan" : "Featured";
  if (/category title/.test(l)) return pick(CATEGORY_NAMES, index);
  if (/faq.*(question|title)|question/.test(l)) return pick(FAQ_QUESTIONS, index);
  if (/faq.*content|answer/.test(l)) return pick(FAQ_ANSWERS, index);
  if (/payment option cadence/.test(l) && /price/.test(l)) return pick(CADENCE_PRICES, index);
  if (/feature|bullet|benefit|perk|highlight/.test(l)) return pick(FEATURES, index);
  if (/subheadline|subtitle|summary|copy|body/.test(l))
    return planish ? pick(PLAN_DESCRIPTIONS, index) : GENERIC_DESCRIPTION;
  if (/title|name|heading|headline|header/.test(l)) {
    if (!ctx.isItem) return ctx.sectionTitle;
    if (planish) return pick(PLAN_NAMES, index);
    if (/heading/.test(l)) return pick(SEO_HEADINGS, index);
    if (/title/.test(l)) return pick(SEO_LINKS, index);
    return null;
  }
  return null;
}

// Fill every empty text field in a freshly built layout section. Items that get
// a title are renamed to it, so the tree shows the same name as the card.
export function fillSampleContent(root: StructureNode, layoutId: string, layoutName: string): void {
  const planish = /plan|payment|comparison|pricing/.test(layoutId);
  const sectionTitle = planish ? PLAN_HEADING : SECTION_HEADINGS[layoutId] ?? layoutName;

  const walk = (node: StructureNode, index: number, isItem: boolean) => {
    const props = node.props;
    if (props?.kind === "fields") {
      for (const group of props.data.groups ?? []) {
        for (const field of group.fields as PropertyField[]) {
          if (field.value) continue;
          if (field.kind && field.kind !== "text" && field.kind !== "textarea") continue;
          const value = sampleFor(field.label, { planish, index, isItem, sectionTitle });
          if (value) field.value = value;
        }
      }
      if (isItem) {
        const named = (props.data.groups ?? [])
          .flatMap((g) => g.fields)
          .find((f) => isNameField(node, f.label) && f.value.trim());
        if (named) node.label = named.value.trim();
      }
    }
    (node.children ?? []).forEach((child, i) =>
      walk(child, i, child.objectType === "schema-item"),
    );
  };
  walk(root, 0, false);
}
