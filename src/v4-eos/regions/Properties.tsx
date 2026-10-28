import {
  createContext,
  Fragment,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../ui-lib/Icon";
import { MSym } from "@/v4-eos/ui/msym";
import { Button } from "@/v4-eos/ui/button";
import { Badge } from "@/v4-eos/ui/badge";
import { Separator } from "@/v4-eos/ui/separator";
import { ScrollArea } from "@/v4-eos/ui/scroll-area";
import {
  TextField,
  TextAreaField,
  CheckboxField,
  SwitchField,
  SelectField,
  RadioField,
} from "@/v4-eos/ui/form-controls";
import {
  InspectorBody,
  InspectorCallout,
  InspectorHeader,
  inspectorKindLabel,
  inspectorType,
  ListAccessory,
  ListItem,
  PropertyRow as PropRow,
  PropertyRows,
  PropertySection as PropSection,
  sentenceCase,
} from "@/v4-eos/ui/property";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/v4-eos/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/v4-eos/ui/tooltip";
import { cn } from "@/v4-eos/ui/lib/utils";
import {
  resolvePropertiesForVariant,
  resolveWidgetPropertiesForVariant,
  type AuthoringContext,
  type PropertyField,
  type PropertyGroup,
  type ObjectProperties,
  type CollectionProperties,
  type SectionMetadata,
  type NoticeProperties,
  type StructureNode,
  type StructureObjectType,
  type VariantWorkspace,
} from "../data";
import { allowedChildType, maxChildrenFor } from "../elements";
import { findNodeById } from "../structureOps";
import { classifyWidget, WIDGET_FAMILY_HUE } from "../browse";
import { hostsPanelLists, panelItemTitle, panelListsOf, panelOnlyIds } from "../structure-panel";

// Widget-only wayfinding: the Offers / Segmentation collections list their
// children by Offer Type, so each row gets the same family dot the Widgets list
// and Structure tree use. Gated on the "Offer Type" itemNoun so it never leaks
// into Page collections (Variants, feature bullets, …).
const OFFER_TYPE_NOUN = "Offer Type";

// Selects a structure node in the tree (the shell's selection). Collection rows
// use it so clicking a row opens that item, as clicking it in the tree would.
const SelectNodeContext = createContext<((nodeId: string) => void) | null>(null);

interface PropertiesProps {
  // Selects a structure node (see SelectNodeContext).
  onSelectStructureNode?: (nodeId: string) => void;
  // The active authoring context; selects which Properties resolver is used.
  context: AuthoringContext;
  // The active experience: Variant (Page) or Widget config (Widget). Null when
  // a route \u2014 not an experience \u2014 is selected.
  variant: VariantWorkspace | null;
  // The selected route id (used only for the empty-state message).
  selectedRouteId: string | null;
  // The selected STRUCTURE object id within the active experience.
  selectedStructureNodeId: string | null;
  // The selected instance's authored VALUES (its `content`, the placeholder.content
  // analog). Field controls overlay these on the registry schema defaults, and
  // editing writes back via onEditField — which persists on the instance and
  // drives the live preview.
  content: Record<string, string>;
  // Labels of the selected object's required fields that are currently empty
  // (the invalidSections analog, scoped to this object). Marks them invalid.
  invalidFields: Set<string>;
  // The selected object's element type — drives the collection Add/Remove rules
  // (allowed child type + max children).
  selectedObjectType: StructureObjectType | null;
  onEditField: (nodeId: string, label: string, value: string) => void;
  // Container authoring: add a child of the given type, remove a child by id,
  // and reorder a child within its parent list (the add-plan/product actions).
  onAddChild: (parentId: string, childType: StructureObjectType) => void;
  onRemoveChild: (childId: string) => void;
  onReorderChild: (parentId: string, from: number, to: number) => void;
}

// A single property control. The row (PropertyRow) provides the label, so
// controls render label-less. Controls are CONTROLLED: `value` is the effective
// value (schema default with the author's edit layered on) and `onEdit` records
// a new edit, which flows to the live preview.
function PropertyControl({
  field,
  value,
  onEdit,
  id,
  describedBy,
  invalid,
}: {
  field: PropertyField;
  value: string;
  onEdit: (value: string) => void;
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}) {
  if (field.kind === "checkbox") {
    return (
      <CheckboxField
        checked={value === "true"}
        onCheckedChange={(v) => onEdit(v ? "true" : "false")}
      />
    );
  }
  if (field.kind === "switch") {
    return (
      <SwitchField
        checked={value === "true"}
        onCheckedChange={(v) => onEdit(v ? "true" : "false")}
      />
    );
  }
  if (field.kind === "asset") {
    return <AssetPicker value={value} onEdit={onEdit} />;
  }
  if (field.kind === "textarea") {
    return (
      <TextAreaField
        id={id}
        value={value}
        onChange={(e) => onEdit(e.target.value)}
        aria-describedby={describedBy}
        invalid={invalid}
      />
    );
  }
  if (field.kind === "select") {
    return (
      <SelectField
        id={id}
        value={value}
        onValueChange={onEdit}
        options={field.options ?? []}
        invalid={invalid}
        polished
      />
    );
  }
  if (field.kind === "radio") {
    return (
      <RadioField
        name={id}
        value={value}
        onValueChange={onEdit}
        options={field.options ?? []}
      />
    );
  }
  return (
    <TextField
      id={id}
      value={value}
      onChange={(e) => onEdit(e.target.value)}
      aria-describedby={describedBy}
      invalid={invalid}
    />
  );
}

// --- V2-local Properties compositions ---------------------------------------
// Dense two-column layout: a fixed label column and a control column. Kept
// local to V2 for the prototype (promote to src/ui later if reused).

// Asset picker, quieted down. Empty state is a single compact "Choose image"
// affordance — no placeholder tile, no "No asset selected" filler. When set, a
// small thumbnail + filename + an unobtrusive × to clear. One element per state,
// no nested containers (§ eliminate container-in-container). Both affordances
// write back through onEdit so the author can add AND remove the asset live
// (choosing sets the bundled demo asset; the × clears it) — the value flows to
// the preview like every other field. The prototype ships a single bundled
// image asset, so "Choose image…" sets that token rather than opening a picker.
const DEMO_ASSET = "peacock-logo";
function AssetPicker({
  value,
  onEdit,
}: {
  value: string;
  onEdit: (value: string) => void;
}) {
  const empty = value.trim() === "";
  if (empty) {
    return (
      <button
        type="button"
        onClick={() => onEdit(DEMO_ASSET)}
        className="inline-flex h-[var(--control-height-md)] items-center gap-1.5 rounded-[var(--radius-field)] border border-dashed border-[var(--color-border-default)] px-2.5 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium text-muted-foreground transition-colors hover:border-[var(--color-action-primary)] hover:text-[var(--color-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <MSym name="add_photo_alternate" size={16} />
        Choose image…
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-[var(--color-bg-subtle)] text-muted-foreground"
      >
        <Icon name="image" size={15} />
      </span>
      <span className={cn("min-w-0 flex-1 truncate", inspectorType.value)}>{value}</span>
      <button
        type="button"
        aria-label="Remove asset"
        title="Remove"
        onClick={() => onEdit("")}
        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-status-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <MSym name="close" size={16} />
      </button>
    </div>
  );
}

// --- Inline template gallery (Build 4) --------------------------------------
// Grounded in real Iceberg: a Section's content is either built from Modules or
// filled by a published Widget (Section Options → Type: Modules | Widget). The
// gallery lets an author pick a template visually instead of deciphering a
// dropdown — the workshop's "see what a component looks like before adding it"
// ask. Prototype: selecting a card is a no-op that closes the gallery.
interface TemplateCard {
  id: string;
  name: string;
  description: string;
  icon: IconName;
}
interface TemplateGroup {
  label: string;
  cards: TemplateCard[];
}

const MODULE_TEMPLATES: TemplateGroup = {
  label: "Modules",
  cards: [
    { id: "hero", name: "Hero", description: "Title, description, image and CTA.", icon: "star" },
    { id: "carousel", name: "Carousel", description: "Recommendations row from a collection.", icon: "blocks" },
    { id: "faq", name: "FAQ", description: "Dynamic questions and answers.", icon: "help" },
    { id: "text", name: "Text block", description: "Rich copy with headings.", icon: "doc-text" },
  ],
};

// One selectable template card: thumbnail glyph + name + description. A real
// <button> so it is keyboard-focusable and gets the shared focus ring.
function TemplateCardButton({ card, onSelect }: { card: TemplateCard; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-2 gap-y-0.5 rounded-sm border border-border bg-[var(--color-bg-surface)] p-2 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden
        className="row-span-2 grid size-9 place-items-center rounded-sm bg-[var(--color-bg-subtle)] text-muted-foreground"
      >
        <Icon name={card.icon} size={20} />
      </span>
      <span className="text-[length:var(--type-body-sm-size)] leading-[length:var(--type-body-sm-lh)] font-semibold text-foreground">{card.name}</span>
      <span className="text-[length:var(--type-body-sm-size)] leading-snug text-muted-foreground">
        {card.description}
      </span>
    </button>
  );
}

// The inline gallery panel. Expands in place under the Add affordance; groups
// cards by Modules vs Widget to mirror the real Section Options type choice.
function TemplateGallery({
  groups,
  onSelect,
  onCancel,
}: {
  groups: TemplateGroup[];
  onSelect: (card: TemplateCard) => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Choose a template"
      className="mt-2 flex flex-col gap-4 rounded-md border border-border bg-[var(--color-bg-subtle)] p-3"
    >
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <span className="text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {group.label}
          </span>
          <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
            {group.cards.map((card) => (
              <TemplateCardButton key={card.id} card={card} onSelect={() => onSelect(card)} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// A field label with an optional info-icon tooltip (§6). The icon is a hover/
// focus target carrying contextual help so the panel stays uncluttered — long
// copy wraps in the Radix tooltip instead of overflowing the narrow panel.
function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  if (!tooltip) return <>{label}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              role="img"
              aria-label={`Help: ${label}`}
              onClick={(e) => e.preventDefault()}
              className="inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <MSym name="info" size={14} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-balance">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

// Stacked fields, compact rows, or list rows (switch/checkbox/badge).
function PropertyFieldRow({
  field,
  value,
  invalid,
  onEdit,
}: {
  field: PropertyField;
  value: string;
  invalid: boolean;
  onEdit: (value: string) => void;
}) {
  const id = useId();
  const errId = invalid ? `${id}-err` : undefined;
  const helpId = field.helper ? `${id}-help` : undefined;
  const label = <FieldLabel label={field.label} tooltip={field.tooltip} />;
  // §item4 A field can present a read-only status badge in place of an editable
  // control (e.g. an offer's "Expired" pill in STATUS) — no input, no id wiring.
  if (field.badge) {
    return (
      <ListItem
        primary={label}
        trailing={
          <ListAccessory type="label">
            <Badge variant={field.badgeTone ?? "secondary"}>{field.badge}</Badge>
          </ListAccessory>
        }
      />
    );
  }
  // Eos List / Switches: the switch is a separate trailing action.
  if (field.kind === "switch") {
    return (
      <ListItem
        primary={label}
        labelFor={id}
        secondary={field.helper}
        secondaryId={helpId}
        trailing={
          <ListAccessory type="switch">
            <SwitchField
              id={id}
              checked={value === "true"}
              onCheckedChange={(v) => onEdit(v ? "true" : "false")}
              aria-describedby={helpId}
            />
          </ListAccessory>
        }
      />
    );
  }
  // Eos List / Selection: the leading checkbox is the row's primary action.
  if (field.kind === "checkbox") {
    return (
      <ListItem
        primary={label}
        rowFor={id}
        secondary={field.helper}
        secondaryId={helpId}
        leading={
          <ListAccessory>
            <CheckboxField
              id={id}
              checked={value === "true"}
              onCheckedChange={(v) => onEdit(v ? "true" : "false")}
            />
          </ListAccessory>
        }
      />
    );
  }
  const help =
    invalid ? (
      <span id={errId} className="text-[var(--color-status-danger)]">
        {field.label} is required.
      </span>
    ) : field.helper ? (
      <span id={helpId}>{field.helper}</span>
    ) : undefined;

  const control = (
    <PropertyControl
      field={field}
      value={value}
      onEdit={onEdit}
      id={id}
      describedBy={errId ?? helpId}
      invalid={invalid}
    />
  );

  return (
    <PropRow label={label} htmlFor={id} required={field.required} help={help}>
      {control}
    </PropRow>
  );
}

// The rows of a group. Each field's value is the schema default with the
// author's edit (if any) layered on; editing calls onEdit(label, value).
function GroupRows({
  group,
  overridesForNode,
  invalidFields,
  onEdit,
}: {
  group: PropertyGroup;
  overridesForNode: Record<string, string>;
  invalidFields: Set<string>;
  onEdit: (label: string, value: string) => void;
}) {
  return (
    <PropertyRows>
      {group.fields.map((field) => (
        <PropertyFieldRow
          key={field.label}
          field={field}
          value={overridesForNode[field.label] ?? field.value}
          invalid={invalidFields.has(field.label)}
          onEdit={(v) => onEdit(field.label, v)}
        />
      ))}
    </PropertyRows>
  );
}

// A titled group of rows (PRODUCT / CTA / LEGAL …). Headed groups collapse.
function GroupSection({
  group,
  expanded,
  onToggle,
  borderedTop,
  overridesForNode,
  invalidFields,
  onEdit,
}: {
  group: PropertyGroup;
  expanded: boolean;
  onToggle: () => void;
  borderedTop?: boolean;
  overridesForNode: Record<string, string>;
  invalidFields: Set<string>;
  onEdit: (label: string, value: string) => void;
}) {
  return (
    <PropSection
      header={group.header}
      expanded={expanded}
      onToggle={onToggle}
      borderedTop={borderedTop}
    >
      <GroupRows
        group={group}
        overridesForNode={overridesForNode}
        invalidFields={invalidFields}
        onEdit={onEdit}
      />
    </PropSection>
  );
}

// --- Inline child collections (feature bullets) -----------------------------
// Real Iceberg renders a product's `productFeaturesList` (a `tabs` field) INLINE
// within the card's form, not as a separate destination. We keep the feature
// bullets as Structure nodes for tree navigation, but ALSO surface them here so
// a card's bullets (icon + text) are editable — with add/remove — right where
// the card is selected. Each row writes to its own feature node's content.

// Whether a product's child collection holds its feature bullets.
function isFeatureListNode(node: StructureNode): boolean {
  const l = node.label.toLowerCase();
  const noun = (node.itemNoun ?? "").toLowerCase();
  return (
    node.objectType === "product-features-list" ||
    noun.includes("feature") ||
    l.includes("feature") ||
    l.includes("product list")
  );
}

// Flatten a resolved fields object to its editable field list (groups or flat).
function flattenFields(data: ObjectProperties): PropertyField[] {
  if (data.groups) return data.groups.flatMap((g) => g.fields);
  return data.fields ?? [];
}

// Curated feature-icon set. Values are Material Symbols names, so the stored
// value IS the glyph (existing sample data uses "check", already valid).
const FEATURE_ICONS: { value: string; label: string }[] = [
  { value: "check", label: "Check" },
  { value: "emoji_events", label: "Trophy" },
  { value: "star", label: "Star" },
  { value: "bolt", label: "Speed" },
  { value: "live_tv", label: "Live TV" },
  { value: "sports_soccer", label: "Sports" },
  { value: "download", label: "Download" },
  { value: "hd", label: "HD / 4K" },
  { value: "closed_caption", label: "Captions" },
  { value: "devices", label: "Devices" },
  { value: "cloud_done", label: "Cloud" },
  { value: "family_restroom", label: "Profiles" },
];

// The icon tile: a single quiet control that shows the current glyph (or a muted
// "add" hint when empty) and opens a picker on click. No floating corner badges
// — clearing lives inside the picker as a "Remove icon" row. Writes the chosen
// glyph back through onChange.
function FeatureIconTile({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const has = value.trim() !== "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={has ? `Feature icon: ${value}. Change icon` : "Choose a feature icon"}
          className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-field)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-foreground transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {has ? (
            <MSym name={value} size={20} />
          ) : (
            <MSym name="add" size={18} className="text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto p-1.5">
        <div className="grid grid-cols-4 gap-1">
          {FEATURE_ICONS.map((ic) => (
            <button
              key={ic.value}
              type="button"
              title={ic.label}
              aria-label={ic.label}
              aria-pressed={value === ic.value}
              onClick={() => onChange(ic.value)}
              className={cn(
                "grid size-9 place-items-center rounded-sm text-foreground transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                value === ic.value &&
                  "bg-[var(--color-bg-selected)] text-[var(--color-action-primary)]",
              )}
            >
              <MSym name={ic.value} size={20} />
            </button>
          ))}
        </div>
        {has && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] text-muted-foreground transition-colors hover:bg-[var(--color-status-danger-bg)] hover:text-[var(--color-status-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <MSym name="close" size={14} />
            Remove icon
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// One feature bullet, modernized: an icon tile (with clear/add badge) + the
// description field on one row, then a Remove control. The icon and description
// fields are surfaced directly (no redundant per-field labels); any extra schema
// fields fall back to standard labelled rows so nothing is lost.
function InlineFeatureItem({
  fields,
  overrides,
  onEdit,
  onRemove,
  removable,
}: {
  fields: PropertyField[];
  overrides: Record<string, string>;
  onEdit: (label: string, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const iconField = fields.find(
    (f) => f.kind === "asset" || f.label.toLowerCase().includes("icon"),
  );
  const textField =
    fields.find(
      (f) =>
        f !== iconField &&
        (f.kind === "textarea" || f.kind === "text" || f.kind === undefined),
    ) ?? fields.find((f) => f !== iconField);
  const extraFields = fields.filter((f) => f !== iconField && f !== textField);
  const descId = useId();
  const iconValue = iconField
    ? overrides[iconField.label] ?? iconField.value
    : "";
  const textValue = textField
    ? overrides[textField.label] ?? textField.value
    : "";
  const textInvalid = !!textField?.required && textValue.trim() === "";

  return (
    <div className="flex flex-col gap-2.5">
      {/* One calm line: quiet icon tile · description field · unobtrusive trash
          (muted → danger on hover), matching the asset-picker treatment. */}
      <div className="flex items-center gap-2">
        {iconField && (
          <FeatureIconTile
            value={iconValue}
            onChange={(v) => onEdit(iconField.label, v)}
          />
        )}
        {textField && (
          <div className="min-w-0 flex-1">
            <TextField
              id={descId}
              aria-label={textField.label}
              value={textValue}
              onChange={(e) => onEdit(textField.label, e.target.value)}
              invalid={textInvalid}
              placeholder="Describe this feature…"
              className="h-9"
            />
            {textInvalid && (
              <p className="mt-1 text-[length:var(--type-label-md-size)] leading-snug text-[var(--color-status-danger)]">
                {textField.label} is required.
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          disabled={!removable}
          title={removable ? "Remove feature" : "At least one feature required"}
          aria-label="Remove feature"
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-[var(--color-status-danger-bg)] hover:text-[var(--color-status-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
        >
          <MSym name="delete" size={16} />
        </button>
      </div>
      {extraFields.length > 0 && (
        <PropertyRows>
          {extraFields.map((field) => (
            <PropertyFieldRow
              key={field.label}
              field={field}
              value={overrides[field.label] ?? field.value}
              invalid={false}
              onEdit={(v) => onEdit(field.label, v)}
            />
          ))}
        </PropertyRows>
      )}
    </div>
  );
}

// One panel-only item that is not a feature bullet (a price cadence, a plan's
// Product List entry, a footer link): its label as the heading, its own fields
// as editable rows, and a Remove control.
function InlineItemBlock({
  title,
  fields,
  overrides,
  onEdit,
  onRemove,
  removable,
}: {
  title: string;
  fields: PropertyField[];
  overrides: Record<string, string>;
  onEdit: (label: string, value: string) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium text-foreground">
          {title}
        </span>
        <button
          type="button"
          disabled={!removable}
          title={removable ? `Remove ${title}` : "At least one item required"}
          aria-label={`Remove ${title}`}
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-[var(--color-status-danger-bg)] hover:text-[var(--color-status-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
        >
          <MSym name="delete" size={16} />
        </button>
      </div>
      {fields.length > 0 && (
        <PropertyRows>
          {fields.map((field) => (
            <PropertyFieldRow
              key={field.label}
              field={field}
              value={overrides[field.label] ?? field.value}
              invalid={false}
              onEdit={(v) => onEdit(field.label, v)}
            />
          ))}
        </PropertyRows>
      )}
    </div>
  );
}

// Panel-only lists under a node, as inline editors: feature bullets get the
// icon + text row; every other list gets a labelled block per item.
function InlinePanelLists({
  lists,
  resolve,
  overridesFor,
  isOpen,
  onToggleList,
  onEditField,
  onAddChild,
  onRemoveChild,
  panelIds,
  renderTabbed,
}: {
  lists: StructureNode[];
  // Panel-only ids, and the renderer for a list whose items are tabs (the
  // products under a category), so its items can hold their own lists.
  panelIds: ReadonlySet<string>;
  renderTabbed: (listId: string) => ReactNode;
  resolve: (id: string) => ObjectProperties | null;
  overridesFor: (id: string) => Record<string, string>;
  // Controlled collapse: state lives in the parent FieldsBody so these sections
  // join its Expand all / Collapse all.
  isOpen: (key: string) => boolean;
  onToggleList: (key: string) => void;
  onEditField: (nodeId: string, label: string, value: string) => void;
  onAddChild: (parentId: string, childType: StructureObjectType) => void;
  onRemoveChild: (childId: string) => void;
}) {
  if (!lists.length) return null;

  return (
    <>
      {lists.map((list) => {
        if (hostsPanelLists(list, panelIds))
          return <Fragment key={list.id}>{renderTabbed(list.id)}</Fragment>;
        const items = list.children ?? [];
        const feature = isFeatureListNode(list);
        const noun = list.itemNoun ?? (feature ? "Feature" : "Item");
        const childType = allowedChildType(list.objectType);
        const max = list.maxChildren ?? maxChildrenFor(list.objectType);
        const atMax = max != null && items.length >= max;
        const open = isOpen(list.id);
        const canAdd = !!childType && !atMax;
        const nounLower = noun.toLowerCase();
        return (
          <PropSection
            key={list.id}
            header={`${list.label} · ${items.length}${max != null ? ` / ${max}` : ""}`}
            expanded={open}
            onToggle={() => onToggleList(list.id)}
          >
            <div className="flex flex-col px-3 py-2">
              {items.map((item, i) => {
                const resolved = resolve(item.id);
                const fields = resolved ? flattenFields(resolved) : [];
                const rowProps = {
                  overrides: overridesFor(item.id),
                  onEdit: (label: string, value: string) => onEditField(item.id, label, value),
                  onRemove: () => onRemoveChild(item.id),
                  removable: items.length > 1,
                };
                return (
                  <div
                    key={item.id}
                    className={cn(
                      i > 0 &&
                        "mt-3 border-t border-[var(--color-border-subtle)] pt-3",
                    )}
                  >
                    {feature ? (
                      <InlineFeatureItem fields={fields} {...rowProps} />
                    ) : (
                      <InlineItemBlock title={item.label} fields={fields} {...rowProps} />
                    )}
                  </div>
                );
              })}
              {atMax ? (
                <p
                  className={cn(
                    "text-[length:var(--type-body-sm-size)] text-muted-foreground",
                    items.length > 0
                      ? "mt-4 border-t border-[var(--color-border-subtle)] pt-4"
                      : "mt-1"
                  )}
                >
                  Maximum of {max} {nounLower}s reached.
                </p>
              ) : (
                <div
                  className={cn(
                    "flex items-center",
                    items.length > 0 &&
                      "mt-4 border-t border-[var(--color-border-subtle)] pt-4"
                  )}
                >
                  <button
                    type="button"
                    disabled={!canAdd}
                    onClick={() => childType && onAddChild(list.id, childType)}
                    title={`Add ${nounLower}`}
                    aria-label={`Add ${nounLower}`}
                    className="inline-flex h-[var(--control-height-md)] items-center gap-1.5 rounded-[var(--radius-field)] border border-dashed border-[var(--color-border-default)] px-2.5 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium text-muted-foreground transition-colors hover:border-[var(--color-action-primary)] hover:text-[var(--color-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <MSym name="add" size={16} />
                    Add {nounLower}
                  </button>
                </div>
              )}
            </div>
          </PropSection>
        );
      })}
    </>
  );
}

// Fixed-width right panel for the SELECTED object's properties. This is where
// the forms that V1 showed inline now live. Scrolls internally. Always belongs
// to the active experience; shows a contextual empty state when a route (not an
// experience) is selected or when no Structure object is active.
export function Properties({
  context,
  variant,
  selectedRouteId,
  selectedStructureNodeId,
  selectedObjectType,
  content,
  invalidFields,
  onEditField,
  onAddChild,
  onRemoveChild,
  onReorderChild,
  onSelectStructureNode,
}: PropertiesProps) {
  const experienceNoun = context === "widget" ? "widget config" : "variant";
  return (
    // Keep the shell grid contract (.ui-ws__region); internals are
    // shadcn/Tailwind. Dark panel surface. Width is the shared
    // --ws-properties-w custom property (declared in eos.css alongside the
    // .ui-ws grid template) so this element's actual rendered width always
    // matches the grid track reserved for it — DESIGN.md's "fixed ~380–460px"
    // band, and the <=900px full-width collapse, both live there as the
    // single source of truth instead of being duplicated/out of sync here.
    <aside
      aria-label="Properties"
      className="ui-ws__region w-[var(--ws-properties-w)] max-w-full bg-[var(--color-bg-panel)] text-foreground"
    >
      {/* The viewport's inner wrapper is display:table (Radix default), which
          grows to fit the longest unbroken label (e.g. a long dropdown value) and
          pushes the panel past the window. Force it to a block so the body stays
          exactly the panel's width; long values truncate inside their controls. */}
      <SelectNodeContext.Provider value={onSelectStructureNode ?? null}>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
        <InspectorBody>
          {variant && selectedStructureNodeId ? (
            <PropertiesBody
              context={context}
              variant={variant}
              nodeId={selectedStructureNodeId}
              objectType={selectedObjectType}
              overridesForNode={content}
              invalidFields={invalidFields}
              onEdit={(label, value) =>
                onEditField(selectedStructureNodeId, label, value)
              }
              onEditField={onEditField}
              onAddChild={onAddChild}
              onRemoveChild={onRemoveChild}
              onReorderChild={onReorderChild}
            />
          ) : (
            <p className={inspectorType.help}>
              {selectedRouteId
                ? `Select a ${experienceNoun}, then an object in its structure to edit its properties.`
                : "Select an object in the structure to edit its properties."}
            </p>
          )}
        </InspectorBody>
      </ScrollArea>
      </SelectNodeContext.Provider>
    </aside>
  );
}

// Renders the resolved Properties for the active experience's selected object.
// Switches on the resolved kind so every selectable node is meaningful. The
// resolver is chosen by context: Page uses the full Variant resolver, Widget
// uses the placeholder Widget-area resolver.
function PropertiesBody({
  context,
  variant,
  nodeId,
  objectType,
  overridesForNode,
  invalidFields,
  onEdit,
  onEditField,
  onAddChild,
  onRemoveChild,
  onReorderChild,
}: {
  context: AuthoringContext;
  variant: VariantWorkspace;
  nodeId: string;
  objectType: StructureObjectType | null;
  overridesForNode: Record<string, string>;
  invalidFields: Set<string>;
  onEdit: (label: string, value: string) => void;
  onEditField: (nodeId: string, label: string, value: string) => void;
  onAddChild: (parentId: string, childType: StructureObjectType) => void;
  onRemoveChild: (childId: string) => void;
  onReorderChild: (parentId: string, from: number, to: number) => void;
}) {
  const resolveNode = (id: string) =>
    context === "widget"
      ? resolveWidgetPropertiesForVariant(variant, id)
      : resolvePropertiesForVariant(variant, id);
  // Panel-only lists (structure-panel.ts) are edited here, not in the tree.
  const panelIds = useMemo(() => panelOnlyIds(variant.structure), [variant.structure]);
  const node = findNodeById(variant.structure, nodeId);
  const resolved = resolveNode(nodeId);
  // A product's tab and header show its Product Title (see panelItemTitle).
  const titled = <T extends { name?: string; items?: { id: string; label: string }[] }>(
    data: T,
  ): T => {
    const items = data.items?.map((item) => {
      const child = findNodeById(variant.structure, item.id);
      return child ? { ...item, label: panelItemTitle(child) } : item;
    });
    return {
      ...data,
      name: node ? panelItemTitle(node) : data.name,
      ...(items ? { items } : {}),
    } as T;
  };
  if (resolved.kind === "collection") {
    // Items that carry panel-only lists (the three products, each with its
    // features) become one tab each, so the author never walks the tree.
    // Panel-only lists (a category's products) are tabbed, one per item.
    const tabbed = !!node && panelIds.has(node.id);
    return (
      <CollectionBody
        data={titled(resolved.data)}
        nodeId={nodeId}
        objectType={objectType}
        onAddChild={onAddChild}
        onRemoveChild={onRemoveChild}
        onReorderChild={onReorderChild}
        tabbed={tabbed}
        renderItem={(itemId) => {
          const item = findNodeById(variant.structure, itemId);
          return (
            <PropertiesBody
              context={context}
              variant={variant}
              nodeId={itemId}
              objectType={item?.objectType ?? null}
              overridesForNode={item?.content ?? {}}
              invalidFields={invalidFields}
              onEdit={(label, value) => onEditField(itemId, label, value)}
              onEditField={onEditField}
              onAddChild={onAddChild}
              onRemoveChild={onRemoveChild}
              onReorderChild={onReorderChild}
            />
          );
        }}
      />
    );
  }
  if (resolved.kind === "metadata") return <MetadataBody data={resolved.data} />;
  if (resolved.kind === "notice") return <NoticeBody data={resolved.data} />;
  // key={nodeId} remounts FieldsBody per selected object so its per-group
  // expand/collapse memory resets to the default (all open) on each new object.
  // The node's panel-only lists (a product's features, cadences…) render inline
  // under its fields, editable + add/remove.
  const lists = node ? panelListsOf(node, panelIds) : [];
  return (
    <FieldsBody
      key={nodeId}
      data={titled(resolved.data)}
      overridesForNode={overridesForNode}
      invalidFields={invalidFields}
      onEdit={onEdit}
      footerKeys={lists.map((l) => l.id)}
      footer={({ isOpen, toggle }) => (
        <InlinePanelLists
          lists={lists}
          panelIds={panelIds}
          renderTabbed={(listId) => {
            const list = findNodeById(variant.structure, listId);
            return (
              <PropertiesBody
                context={context}
                variant={variant}
                nodeId={listId}
                objectType={list?.objectType ?? null}
                overridesForNode={list?.content ?? {}}
                invalidFields={invalidFields}
                onEdit={(label, value) => onEditField(listId, label, value)}
                onEditField={onEditField}
                onAddChild={onAddChild}
                onRemoveChild={onRemoveChild}
                onReorderChild={onReorderChild}
              />
            );
          }}
          resolve={(id) => {
            const r = resolveNode(id);
            return r.kind === "fields" ? r.data : null;
          }}
          overridesFor={(id) => findNodeById(variant.structure, id)?.content ?? {}}
          isOpen={isOpen}
          onToggleList={toggle}
          onEditField={onEditField}
          onAddChild={onAddChild}
          onRemoveChild={onRemoveChild}
        />
      )}
    />
  );
}

// Editable object: eyebrow + name + grouped property rows. Accepts either a
// flat `fields` list or `groups` (which take precedence). Headed groups are
// collapsible and start expanded; an Expand all / Collapse all control appears
// only when there is more than one headed group.
function FieldsBody({
  data,
  overridesForNode,
  invalidFields,
  onEdit,
  footerKeys = [],
  footer,
}: {
  data: ObjectProperties;
  overridesForNode: Record<string, string>;
  invalidFields: Set<string>;
  onEdit: (label: string, value: string) => void;
  // Extra collapsible sections rendered inside the same divided flow (e.g. a
  // product card's inline feature collections). `footerKeys` are their collapse
  // keys so they join the Expand all / Collapse all set; `footer` receives the
  // shared open/toggle API so their state is unified with the groups above.
  footerKeys?: string[];
  footer?: (api: {
    isOpen: (key: string) => boolean;
    toggle: (key: string) => void;
  }) => React.ReactNode;
}) {
  const { eyebrow, name } = data;
  const groups: PropertyGroup[] = useMemo(() => {
    const raw = data.groups ?? [{ fields: data.fields ?? [] }];
    // §item3 Resolve reactive fields against the LIVE form state: a field with
    // `dependsOn` reads a sibling field's value (author override first, else its
    // schema default) to relabel itself or hide entirely — so the offer code
    // field tracks the "Product / Voucher" select as the author changes it.
    if (!raw.some((g) => g.fields.some((f) => f.dependsOn))) return raw;
    const liveValue = (label: string): string | undefined => {
      if (label in overridesForNode) return overridesForNode[label];
      for (const g of raw) {
        const f = g.fields.find((x) => x.label === label);
        if (f) return f.value;
      }
      return undefined;
    };
    return raw.map((g) => ({
      ...g,
      fields: g.fields.flatMap((f) => {
        if (!f.dependsOn) return [f];
        const ctrl = liveValue(f.dependsOn.field);
        if (ctrl != null && f.dependsOn.hideWhen?.includes(ctrl)) return [];
        const label =
          ctrl != null ? f.dependsOn.labelMap?.[ctrl] ?? f.label : f.label;
        return [{ ...f, label }];
      }),
    }));
  }, [data.groups, data.fields, overridesForNode]);
  const headers = useMemo(
    () => [
      ...groups.map((g) => g.header).filter((h): h is string => !!h),
      ...footerKeys,
    ],
    [groups, footerKeys]
  );
  // Collapsed set (empty ⇒ all expanded). Covers headed groups AND any footer
  // sections (via footerKeys), so Expand all / Collapse all controls both.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (header: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(header) ? next.delete(header) : next.add(header);
      return next;
    });
  const isOpen = (key: string) => !collapsed.has(key);
  const allCollapsed = headers.length > 0 && collapsed.size === headers.length;
  const collapseAll = () => setCollapsed(new Set(headers));
  const expandAll = () => setCollapsed(new Set());

  return (
    <>
      <InspectorHeader
        title={name}
        kind={inspectorKindLabel(eyebrow, name)}
        actions={
          headers.length > 1 ? (
            <Button
              variant="ghost"
              size="xs"
              className={cn(inspectorType.meta, "hover:text-foreground")}
              onClick={allCollapsed ? expandAll : collapseAll}
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </Button>
          ) : undefined
        }
      />
      <div className="flex min-w-0 flex-col">
        {groups.map((group, i) => (
          <GroupSection
            key={`${group.header ?? "group"}-${i}`}
            group={group}
            expanded={group.header ? !collapsed.has(group.header) : true}
            onToggle={group.header ? () => toggle(group.header!) : () => {}}
            borderedTop={Boolean(
              group.header && groups.slice(0, i).some((g) => g.header),
            )}
            overridesForNode={overridesForNode}
            invalidFields={invalidFields}
            onEdit={onEdit}
          />
        ))}
        {footer?.({ isOpen, toggle })}
      </div>
    </>
  );
}

// Structural/collection object: TYPE eyebrow, "N items · max M" count, and an
// EDITABLE item list. Items come from actual Structure children; "Add {itemNoun}"
// instantiates a real child (up to the container's max), each row can be removed
// (down to the min of 1 for capped containers) and reordered. This is the
// add/remove/reorder-plan capability — the tabs minSize/maxSize analog.
function CollectionBody({
  data,
  nodeId,
  objectType,
  onAddChild,
  onRemoveChild,
  onReorderChild,
  tabbed = false,
  renderItem,
}: {
  data: CollectionProperties;
  nodeId: string;
  objectType: StructureObjectType | null;
  onAddChild: (parentId: string, childType: StructureObjectType) => void;
  onRemoveChild: (childId: string) => void;
  onReorderChild: (parentId: string, from: number, to: number) => void;
  // Tabbed: one tab per item, the selected item's panel below (see PropertiesBody).
  tabbed?: boolean;
  renderItem?: (itemId: string) => ReactNode;
}) {
  const { eyebrow, name, itemNoun, items } = data;
  const count = items.length;
  const selectNode = useContext(SelectNodeContext);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const activeIndex = active ? items.findIndex((item) => item.id === active.id) : -1;
  const childType = allowedChildType(objectType ?? undefined);
  const max = data.max ?? maxChildrenFor(objectType ?? undefined);
  const atMax = max != null && count >= max;
  // Capped containers (a defined max) imply a minSize of 1 — keep at least one.
  const atMin = max != null && count <= 1;
  const canAdd = !!childType && !atMax;
  const nounLower = itemNoun.toLowerCase();
  // Only the Offer Type collections (Offers / Segmentation) carry family dots.
  const showFam = itemNoun === OFFER_TYPE_NOUN;

  const displayName = name ?? sentenceCase(eyebrow);
  return (
    <>
      <InspectorHeader
        title={displayName}
        kind={inspectorKindLabel(eyebrow, displayName)}
        actions={
          <span className={inspectorType.meta}>
            {count}
            {max != null ? ` / ${max}` : ""} {count === 1 ? nounLower : `${nounLower}s`}
          </span>
        }
      />

      {tabbed && active && renderItem && (
        <>
          <div
            role="tablist"
            aria-label={`${itemNoun} tabs`}
            className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-border-subtle)]"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === active.id}
                onClick={() => setActiveId(item.id)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-[length:var(--type-body-sm-size)] leading-[length:var(--type-body-sm-lh)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  item.id === active.id
                    ? "border-[var(--color-action-primary)] font-medium text-foreground"
                    : "border-transparent font-normal text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {renderItem(active.id)}
          <div className="flex items-center gap-0.5 border-t border-[var(--color-border-subtle)] pt-3">
            <span className={cn("mr-auto truncate", inspectorType.meta)}>{active.label}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              title={`Move ${nounLower} up`}
              disabled={activeIndex <= 0}
              onClick={() => onReorderChild(nodeId, activeIndex, activeIndex - 1)}
            >
              <MSym name="keyboard_arrow_up" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title={`Move ${nounLower} down`}
              disabled={activeIndex >= count - 1}
              onClick={() => onReorderChild(nodeId, activeIndex, activeIndex + 1)}
            >
              <MSym name="keyboard_arrow_down" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title={atMin ? `At least one ${nounLower} required` : `Remove ${nounLower}`}
              disabled={atMin}
              onClick={() => onRemoveChild(active.id)}
              className="text-muted-foreground hover:text-[var(--color-status-danger)]"
            >
              <MSym name="delete" size={15} />
            </Button>
          </div>
        </>
      )}

      {count > 0 && !tabbed && (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="group/item flex min-h-11 items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg-control)] transition-colors hover:border-[var(--color-action-primary)] focus-within:border-[var(--color-action-primary)]"
            >
              <button
                type="button"
                onClick={() => selectNode?.(item.id)}
                disabled={!selectNode}
                title={`Open ${item.label}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {showFam && (
                  <span aria-hidden className="flex h-6 w-3 shrink-0 items-center justify-center">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: WIDGET_FAMILY_HUE[classifyWidget(item.label)].fam }}
                    />
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 truncate", inspectorType.value)}>
                  {item.label}
                </span>
                {selectNode && (
                  <MSym name="chevron_right" size={18} className="shrink-0 text-muted-foreground" />
                )}
              </button>
              <div className="flex items-center gap-0.5 border-l border-[var(--color-border-default)] px-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={`Move ${nounLower} up`}
                  disabled={i === 0}
                  onClick={() => onReorderChild(nodeId, i, i - 1)}
                >
                  <MSym name="keyboard_arrow_up" size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={`Move ${nounLower} down`}
                  disabled={i === count - 1}
                  onClick={() => onReorderChild(nodeId, i, i + 1)}
                >
                  <MSym name="keyboard_arrow_down" size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={atMin ? `At least one ${nounLower} required` : `Remove ${nounLower}`}
                  disabled={atMin}
                  onClick={() => onRemoveChild(item.id)}
                  className="text-muted-foreground hover:text-[var(--color-status-danger)]"
                >
                  <MSym name="delete" size={15} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canAdd}
          onClick={() => childType && onAddChild(nodeId, childType)}
        >
          <Icon name="plus" size={16} />
          Add {itemNoun}
        </Button>
        {atMax && (
          <span className="text-[length:var(--type-body-sm-size)] text-muted-foreground">
            Maximum of {max} reached.
          </span>
        )}
      </div>
    </>
  );
}

// Page section: PAGE SECTION eyebrow + name, status badge, Section ID, a Design
// mode radio, an Intelligent-authoring affordance, and no-op Duplicate / Delete.
function MetadataBody({ data }: { data: SectionMetadata }) {
  const { eyebrow, name, role, status, sectionId, note, design, designOptions } = data;
  const badgeVariant =
    status === "published" ? "success" : status === "in-review" ? "warning" : "secondary";
  return (
    <>
      <InspectorHeader
        title={name}
        kind={inspectorKindLabel(eyebrow, name)}
        actions={status ? <Badge variant={badgeVariant}>{status}</Badge> : undefined}
      />
      <div className="flex flex-col gap-2">
        <PropertyRows>
          {role && (
            <ListItem
              primary="Type / Role"
              trailing={
                <ListAccessory type="label">
                  <Badge variant="info">{role}</Badge>
                </ListAccessory>
              }
            />
          )}
          <ListItem
            primary="Section ID"
            secondary={<code className="font-mono">{sectionId}</code>}
          />
          {designOptions && (
            <PropRow label="Design">
              <RadioField
                name={`design-${sectionId}`}
                value={design ?? designOptions[0]}
                options={designOptions}
              />
            </PropRow>
          )}
        </PropertyRows>
        {data.intelligentAffordance && (
          <InspectorCallout title="Intelligent authoring">
            Variations are generated per audience. Manage variant names in Section
            Options.
          </InspectorCallout>
        )}
      </div>
      {note && (
        <p className={cn(inspectorType.help, "leading-relaxed")}>{note}</p>
      )}
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => {}}>
          Duplicate
        </Button>
        <Button variant="destructive" size="sm" onClick={() => {}}>
          Delete
        </Button>
      </div>
    </>
  );
}

// Deliberate "no configured content" state (e.g. an empty Predecision).
// "Add module" opens the inline template gallery so the author picks a module
// visually instead of adding a blank one.
function NoticeBody({ data }: { data: NoticeProperties }) {
  const { eyebrow, name, message, detail } = data;
  const [galleryOpen, setGalleryOpen] = useState(false);
  return (
    <>
      <InspectorHeader title={name} kind={inspectorKindLabel(eyebrow, name)} />
      <InspectorCallout title={message}>{detail}</InspectorCallout>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setGalleryOpen((v) => !v)}>
          <Icon name="plus" size={16} />
          Add module
        </Button>
      </div>
      {galleryOpen && (
        <TemplateGallery
          groups={[MODULE_TEMPLATES]}
          onSelect={() => setGalleryOpen(false)}
          onCancel={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}
