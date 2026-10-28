import { Button } from "@/v4-eos/ui/button";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Panel, PanelHeader, SearchInput } from "@/v4-eos/ui/panel";
import { chromeType } from "@/v4-eos/ui/chrome-type";
import { cn } from "@/v4-eos/ui/lib/utils";
import { StructureTreeRow } from "@/v4-eos/ui/structure-tree-row";
import { getStructureNodeVisual } from "@/v4-eos/ui/structure-tree-visual";
import { RowActionsMenu } from "@/v4-eos/ui/row-actions";
import { ScrollArea } from "@/v4-eos/ui/scroll-area";
import { MSym } from "@/v4-eos/ui/msym";
import { useDrag } from "@/v4-eos/ui/useDrag";
import {
  type AuthoringContext,
  type TreeNode,
  type StructureNode,
  type VariantWorkspace,
  WIDGET_OFFERS_NODE_ID,
  WIDGET_OFFER_FILTER_INDEX,
} from "../data";
import { classifyWidget, type WidgetType } from "../browse";
import { panelOnlyIds } from "../structure-panel";
import {
  LAYOUT_TYPES,
  layoutTypeForNode,
  layoutWash,
  type LayoutTypeId,
} from "../layout-identity";

// Type-family wayfinding inside the widget editor: only the widget-only grouping
// nodes carry a family dot, so the cue can never leak into a Page's structure.
// The family is derived from the group's own label (e.g. "Retention Offers" →
// Retention), matching how the Widgets list classifies rows.
const FAM_GROUP_OBJECT_TYPES = new Set(["offer-group", "segmentation-group"]);
function famTypeForNode(node: StructureNode): WidgetType | undefined {
  if (!node.objectType || !FAM_GROUP_OBJECT_TYPES.has(node.objectType)) {
    return undefined;
  }
  return classifyWidget(node.label);
}

// Collection tree — mixes route rows and experience rows (Variants in Page
// context, Widget configs in Widget context). Expansion is local (routes are
// static). Clicking routes to onSelectRoute/onSelectExperience by node type.
// Remounted per context (via a React key) so its local expansion resets when
// the dataset changes. Rows use StructureTreeRow (layers-style hierarchy).
function CollectionTree({
  context,
  tree,
  selectedId,
  onSelectRoute,
  onSelectExperience,
}: {
  context: AuthoringContext;
  tree: TreeNode[];
  selectedId: string | null;
  onSelectRoute: (id: string) => void;
  onSelectExperience: (id: string) => void;
}) {
  const experienceIcon = context === "widget" ? "extension" : "description";
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const acc = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const nd of nodes) {
        if (nd.defaultExpanded) acc.add(nd.id);
        if (nd.children) walk(nd.children);
      }
    };
    walk(tree);
    return acc;
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const render = (list: TreeNode[], depth: number) =>
    list.map((node) => {
      const hasChildren = !!node.children && node.children.length > 0;
      const isOpen = expanded.has(node.id);
      return (
        <div key={node.id}>
          <StructureTreeRow
            depth={depth}
            hasChildren={hasChildren}
            isOpen={isOpen}
            selected={node.id === selectedId}
            label={
              node.kind === "path" ? (
                <span className="font-mono text-[var(--color-text-secondary)]">{node.label}</span>
              ) : (
                node.label
              )
            }
            labelWeight={node.type === "variant" ? "medium" : "regular"}
            icon={
              node.type === "variant"
                ? experienceIcon
                : node.kind === "path"
                  ? "link"
                  : undefined
            }
            onSelect={() =>
              node.type === "variant"
                ? onSelectExperience(node.id)
                : onSelectRoute(node.id)
            }
            onToggle={() => toggle(node.id)}
          />
          {hasChildren && isOpen && render(node.children!, depth + 1)}
        </div>
      );
    });

  return (
    <div className="structure-tree-root structure-tree-root--collection" role="tree">
      {render(tree, 0)}
    </div>
  );
}

// Structure authoring actions supplied by the shell (operate on the editable
// per-experience structure state). Backs both drag-reorder and the row's
// overflow menu (rename / duplicate / copy / paste / disable / delete).
interface StructureActions {
  canPaste: boolean;
  onRenameNode: (id: string, label: string) => void;
  onDuplicateNode: (id: string) => void;
  onCopyNode: (id: string) => void;
  onPasteNode: (afterId: string | null) => void;
  onToggleDisabledNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onMoveNode: (parentId: string | null, from: number, to: number) => void;
  // Page-builder: open the Layout Picker to insert a new top-level section.
  onRequestAddLayout: (
    position: "before" | "after" | "end",
    refId: string | null,
    refLabel?: string,
  ) => void;
}

// A quiet, always-present insert point between top-level sections. Brightens on
// hover/focus into a "+ Add layout" affordance — the page-builder entry point.
// Between two layout regions the bar is the boundary: its centre line is where
// the wash above meets the wash below (see .layout-boundary).
function InsertLayoutBar({
  onClick,
  above,
  below,
}: {
  onClick: () => void;
  above?: LayoutTypeId;
  below?: LayoutTypeId;
}) {
  const boundary = above || below;
  const style = boundary
    ? ({
        "--boundary-above": above ? layoutWash(above) : "transparent",
        "--boundary-below": below ? layoutWash(below) : "transparent",
      } as CSSProperties)
    : undefined;
  return (
    <div
      className={cn("group/ins flex items-center gap-2 px-3 py-1", boundary && "layout-boundary")}
      style={style}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border-strong)] px-2 py-0.5 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium text-muted-foreground transition-colors hover:border-[var(--color-action-primary)] hover:bg-[var(--color-action-primary-bg)] hover:text-[var(--color-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          // Opaque pill on a boundary: the gray line stops at the pill and the
          // two layout washes meet exactly on the line.
          boundary && "bg-[var(--color-bg-elevated)]",
        )}
      >
        <MSym name="add" size={14} />
        Add layout
      </button>
      <span className="h-px flex-1 bg-[var(--color-border-subtle)] transition-colors group-hover/ins:bg-[var(--color-action-primary-border)]" />
    </div>
  );
}

// One sibling list within the Structure tree. Each level owns its own drag
// state (via useDrag) so reordering is scoped to that parent's children — you
// drag a layer among its siblings. Rows expose a grip handle (drag), a
// disclosure control, an inline rename field, and an overflow menu.
function StructureLevel({
  nodes,
  parentId,
  depth,
  dragDisabled,
  panelIds,
  selectedId,
  expanded,
  renamingId,
  draft,
  setDraft,
  startRename,
  commitRename,
  cancelRename,
  onSelect,
  onToggle,
  actions,
  offerQuery,
  setOfferQuery,
  allowInsert,
  allowRowActions,
  minimalRowActions,
  boxedTop,
  noTrailingFade,
}: {
  nodes: StructureNode[];
  parentId: string | null;
  depth: number;
  dragDisabled?: boolean;
  // Panel-only lists (see structure-panel.ts): hidden here, shown in Properties.
  panelIds: ReadonlySet<string>;
  selectedId: string | null;
  expanded: Set<string>;
  renamingId: string | null;
  draft: string;
  setDraft: (v: string) => void;
  startRename: (id: string, label: string) => void;
  commitRename: (id: string) => void;
  cancelRename: () => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  actions: StructureActions;
  offerQuery: string;
  setOfferQuery: (v: string) => void;
  // Page-builder insert points ("+ Add layout"). Pages only — widgets have a
  // fixed, schema-driven structure with no addable page layouts.
  allowInsert: boolean;
  // Per-row overflow menu. Shown in both contexts; the action SET differs —
  // pages get the full menu (rename / duplicate / copy / paste / disable /
  // delete), widgets get the minimal set (rename / copy / paste) via
  // minimalRowActions, since widget structure has no duplicate/disable/delete.
  allowRowActions: boolean;
  minimalRowActions?: boolean;
  // Widget tab boxes: the single node at this (top) level shows selection on its
  // wrapping box, so its row suppresses the row/layer selection cue. Descendants
  // recurse without this flag and keep normal row selection.
  boxedTop?: boolean;
  // Widget context: drop the trailing overflow menu's faded band/gradient.
  noTrailingFade?: boolean;
}) {
  const drag = useDrag((from, to) => actions.onMoveNode(parentId, from, to));
  const q = offerQuery.trim().toLowerCase();

  // Does an offer node match the current Offers search?
  const offerMatches = (c: StructureNode): boolean => {
    const idx = WIDGET_OFFER_FILTER_INDEX[c.id];
    if (!idx) return c.label.toLowerCase().includes(q);
    return idx.label.toLowerCase().includes(q) || idx.keys.includes(q);
  };

  // Offers search is group-aware: filtering the Offers node drops empty Offer
  // Type groups; filtering a group drops non-matching offers. Order preserved.
  const visibleChildren = (node: StructureNode): StructureNode[] => {
    const children = node.children ?? [];
    if (!q) return children;
    if (node.id === WIDGET_OFFERS_NODE_ID) {
      return children.filter((g) => (g.children ?? []).some(offerMatches));
    }
    if (node.objectType === "offer-group") {
      return children.filter(offerMatches);
    }
    return children;
  };

  // Top-level lists get page-builder insert points between/around sections.
  const isTopLevel = parentId === null;

  return (
    <>
      {nodes.map((node, index) => {
        if (panelIds.has(node.id)) return null;
        const isOffers = node.id === WIDGET_OFFERS_NODE_ID;
        const isOfferGroup = node.objectType === "offer-group";
        const hasChildren = (node.children ?? []).some((c) => !panelIds.has(c.id));
        // While searching Offers, force the type groups open so matches show.
        const isOpen =
          expanded.has(node.id) || (!!q && isOfferGroup);
        const kids = visibleChildren(node);
        // Reorder must map to the real structure, so drag is disabled while the
        // Offers list is filtered (indices would not match).
        const childDragDisabled = (isOffers || isOfferGroup) && !!q;
        const visual = getStructureNodeVisual(node, { depth, index, parentId });
        // Layout identity: a top-level page section is one layout region. The
        // region wrapper below tints its whole subtree; nested rows inherit it.
        const layoutType = depth === 0 ? layoutTypeForNode(node) : undefined;
        const layoutDef = layoutType ? LAYOUT_TYPES[layoutType] : undefined;
        const grip = dragDisabled ? null : (
          <span
            {...drag.gripProps(index)}
            onClick={(e) => e.stopPropagation()}
            className="flex size-4 cursor-grab items-center justify-center text-[var(--color-text-secondary)] opacity-0 transition-opacity group-hover/row:opacity-100 active:cursor-grabbing"
            title="Drag to reorder"
            aria-hidden
          >
            <MSym name="drag_indicator" size={14} />
          </span>
        );
        return (
          <div key={node.id} className={isTopLevel && allowInsert ? "layout-gutter" : undefined}>
            {visual.sectionBreak && !(isTopLevel && allowInsert) && (
              <div className="structure-tree-break" aria-hidden role="presentation" />
            )}
            {isTopLevel && allowInsert && (
              <InsertLayoutBar
                above={index > 0 ? layoutTypeForNode(nodes[index - 1]) : undefined}
                below={layoutType}
                onClick={() =>
                  actions.onRequestAddLayout("before", node.id, node.label)
                }
              />
            )}
            <div
              className={layoutType ? "layout-region" : undefined}
              data-layout-type={layoutType}
              data-layout-label={layoutDef?.name.toUpperCase()}
            >
              <StructureTreeRow
                depth={depth}
                fluid
                boxed={boxedTop}
                noTrailingFade={noTrailingFade}
                famType={famTypeForNode(node)}
                hasChildren={hasChildren}
                isOpen={isOpen}
                selected={node.id === selectedId}
                disabled={node.disabled}
                icon={layoutDef ? layoutDef.icon : visual.icon}
                layoutAccent={!!layoutDef}
                labelWeight={visual.labelWeight}
                grip={grip}
                dropHandlers={dragDisabled ? undefined : drag.dropProps(index)}
                isDragging={drag.isDragging(index)}
                isOver={drag.isOver(index)}
                label={
                  renamingId === node.id ? (
                    <input
                      autoFocus
                      aria-label="Rename"
                      className="w-full rounded-[var(--radius-field)] border border-input bg-background px-1.5 py-0.5 text-[length:var(--structure-tree-size)] leading-[length:var(--structure-tree-lh)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => commitRename(node.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(node.id);
                        else if (e.key === "Escape") cancelRename();
                      }}
                    />
                  ) : node.badge ? (
                    // Inline status pill after the label: an offer's "Live" flag
                    // (§4) or a segment's Optimizely mapping state (§11).
                    <span className="inline-flex items-center gap-1.5">
                      <span>{node.label}</span>
                      <span
                        className={`ui-badge${node.badgeTone ? ` ui-badge--${node.badgeTone}` : ""}`}
                        style={{ padding: "0 6px", fontSize: 10, lineHeight: "16px" }}
                      >
                        {node.badge}
                      </span>
                    </span>
                  ) : (
                    node.label
                  )
                }
                trailing={
                  allowRowActions ? (
                    <RowActionsMenu
                      label={node.label}
                      minimal={minimalRowActions}
                      disabled={node.disabled}
                      canPaste={actions.canPaste}
                      onRename={() => startRename(node.id, node.label)}
                      onDuplicate={() => actions.onDuplicateNode(node.id)}
                      onCopy={() => actions.onCopyNode(node.id)}
                      onPaste={() => actions.onPasteNode(node.id)}
                      onToggleDisabled={() => actions.onToggleDisabledNode(node.id)}
                      onDelete={() => actions.onDeleteNode(node.id)}
                    />
                  ) : undefined
                }
                onSelect={() => onSelect(node.id)}
                onToggle={() => onToggle(node.id)}
              />
              {isOffers && isOpen && (
                <div
                  className="py-1 pr-2"
                  style={{
                    paddingLeft: `calc(var(--structure-tree-pad-x) + ${(depth + 1) * 12}px + 20px)`,
                  }}
                >
                  <SearchInput
                    value={offerQuery}
                    onChange={setOfferQuery}
                    onClear={() => setOfferQuery("")}
                    placeholder="Search offers…"
                  />
                </div>
              )}
              {hasChildren && isOpen && (
                <StructureLevel
                  nodes={kids}
                  parentId={node.id}
                  depth={depth + 1}
                  dragDisabled={childDragDisabled}
                  panelIds={panelIds}
                  selectedId={selectedId}
                  expanded={expanded}
                  renamingId={renamingId}
                  draft={draft}
                  setDraft={setDraft}
                  startRename={startRename}
                  commitRename={commitRename}
                  cancelRename={cancelRename}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  actions={actions}
                  offerQuery={offerQuery}
                  setOfferQuery={setOfferQuery}
                  allowInsert={allowInsert}
                  allowRowActions={allowRowActions}
                  minimalRowActions={minimalRowActions}
                  noTrailingFade={noTrailingFade}
                />
              )}
            </div>
          </div>
        );
      })}
      {isTopLevel && allowInsert && (
        <div className="layout-gutter">
          <InsertLayoutBar
            above={nodes.length ? layoutTypeForNode(nodes[nodes.length - 1]) : undefined}
            onClick={() => actions.onRequestAddLayout("end", null)}
          />
        </div>
      )}
    </>
  );
}

// Top-level widget nodes that are global CONFIGURATION panels rather than
// repeatable CONTENT collections (Offers / Segmentation / Survey Responses).
const WIDGET_CONFIG_NODE_IDS = new Set([
  "wg-widget-settings",
  "wg-journey-flows",
]);

// Horizontal tab strip that splits the widget Structure into its two kinds of
// top-level nodes: global CONFIGURATIONS (Widget Settings, Journey Flows) and
// repeatable CONTENT collections (Offers, Segmentation, Survey Responses).
type StructureTab = "config" | "content";
function StructureTabs({
  active,
  onChange,
}: {
  active: StructureTab;
  onChange: (t: StructureTab) => void;
}) {
  const tab = (id: StructureTab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={active === id}
      onClick={() => onChange(id)}
      className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[length:var(--type-body-sm-size)] leading-[length:var(--type-body-sm-lh)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        active === id
          ? "border-[var(--color-action-primary)] font-medium text-foreground"
          : "border-transparent font-normal text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="tablist"
      className="mb-2 flex w-full items-center gap-3 border-b border-[var(--color-border-subtle)] px-1"
    >
      {tab("config", "Configurations")}
      {/* §item2 Anna: "Content" didn't read right for the offer section. */}
      {tab("content", "Authoring")}
    </div>
  );
}

// STRUCTURE tree — fully controlled by the shell so expansion + selection are
// scoped per active Variant. Layers can be drag-reordered among siblings and
// edited via each row's overflow menu. The Widget Offers collection (80+
// children) keeps its local search/filter affordance.
function StructureTree({
  nodes,
  selectedId,
  expanded,
  onSelect,
  onToggle,
  actions,
  allowInsert,
  allowRowActions,
  minimalRowActions,
  grouped,
  noTrailingFade,
}: {
  nodes: StructureNode[];
  selectedId: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  actions: StructureActions;
  allowInsert: boolean;
  allowRowActions: boolean;
  minimalRowActions?: boolean;
  // Widget context: split the top level into CONFIGURATION + CONTENT sections
  // and wrap the content collections in a boxed, collapsible group.
  grouped?: boolean;
  // Widget context: drop the trailing overflow menu's faded band/gradient.
  noTrailingFade?: boolean;
}) {
  const [offerQuery, setOfferQuery] = useState("");
  const panelIds = useMemo(() => panelOnlyIds(nodes), [nodes]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startRename = (id: string, label: string) => {
    setDraft(label);
    setRenamingId(id);
  };
  const commitRename = (id: string) => {
    actions.onRenameNode(id, draft);
    setRenamingId(null);
  };
  const cancelRename = () => setRenamingId(null);

  // Widget top level is presented as two tabs; Configurations opens by default.
  const [activeTab, setActiveTab] = useState<StructureTab>("config");
  // A widget with sections but no configuration nodes (e.g. built from a layout)
  // opens on Authoring, where its sections live.
  const hasConfigNodes = nodes.some((n) => WIDGET_CONFIG_NODE_IDS.has(n.id));
  const hasContentNodes = nodes.some((n) => !WIDGET_CONFIG_NODE_IDS.has(n.id));
  useEffect(() => {
    if (!hasConfigNodes && hasContentNodes) setActiveTab("content");
  }, [hasConfigNodes, hasContentNodes]);

  // Render one top-level sibling list. In grouped (widget) mode the top level is
  // a fixed schema, so its rows aren't drag-reorderable — and splitting the list
  // across two sections would otherwise desync drag indices; children keep their
  // own drag via the nested StructureLevel.
  const level = (list: StructureNode[], boxedTop?: boolean) => (
    <StructureLevel
      nodes={list}
      parentId={null}
      depth={0}
      dragDisabled={grouped || undefined}
      panelIds={panelIds}
      selectedId={selectedId}
      expanded={expanded}
      renamingId={renamingId}
      draft={draft}
      setDraft={setDraft}
      startRename={startRename}
      commitRename={commitRename}
      cancelRename={cancelRename}
      onSelect={onSelect}
      onToggle={onToggle}
      actions={actions}
      offerQuery={offerQuery}
      setOfferQuery={setOfferQuery}
      allowInsert={allowInsert}
      allowRowActions={allowRowActions}
      minimalRowActions={minimalRowActions}
      boxedTop={boxedTop}
      noTrailingFade={noTrailingFade}
    />
  );

  const configNodes = nodes.filter((n) => WIDGET_CONFIG_NODE_IDS.has(n.id));
  const contentNodes = nodes.filter((n) => !WIDGET_CONFIG_NODE_IDS.has(n.id));

  // Widget top-level nodes render as boxed tabs with ONE unified treatment
  // (Configurations and Content read as the same kind of unit): a quiet hairline
  // at rest — no card fill inside the already-toned panel — getting only the
  // tinted fill (no accent stroke) when the box is the current selection, so selection
  // reads as "this box", not a layer/row inside it.
  const boxClass = (nodeId: string) =>
    nodeId === selectedId
      ? "w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-selected)] p-0.5"
      : "w-full rounded-[var(--radius-sm)] p-0.5 transition-colors hover:bg-[var(--color-bg-hover)]";

  return (
    <div className="structure-tree-root flex min-w-max flex-col" role="tree">
      {grouped ? (
        <>
          <StructureTabs active={activeTab} onChange={setActiveTab} />
          {activeTab === "config" ? (
            // Each configuration panel is a self-contained boxed CTA — clicking
            // it opens that global settings form in Properties.
            <div className="flex w-full flex-col gap-1.5">
              {configNodes.map((n) => (
                <div key={n.id} className={boxClass(n.id)}>
                  {level([n], true)}
                </div>
              ))}
            </div>
          ) : (
            // Each content collection is its own boxed, expandable tab (Offers /
            // Segmentation / Survey Responses) rather than one shared group, so
            // each reads as a distinct top-level unit.
            <div className="flex w-full flex-col gap-1.5">
              {contentNodes.map((n) => (
                <div key={n.id} className={boxClass(n.id)}>
                  {level([n], true)}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        level(nodes)
      )}
    </div>
  );
}

// Finds a node's label anywhere in the given collection tree (for the Structure
// empty-state header when a route — not an experience — is selected).
function findRouteLabel(tree: TreeNode[], id: string | null): string | null {
  if (!id) return null;
  let result: string | null = null;
  const walk = (nodes: TreeNode[]) => {
    for (const nd of nodes) {
      if (nd.id === id) result = nd.label;
      if (nd.children) walk(nd.children);
    }
  };
  walk(tree);
  return result;
}

interface ExplorerProps {
  context: AuthoringContext;
  collectionTree: TreeNode[];
  collectionHeader: string; // plural collection name (PAGES / WIDGETS)
  selectedRouteId: string | null;
  selectedExperienceId: string | null;
  activeExperience: VariantWorkspace | null;
  selectedStructureNodeId: string | null;
  expanded: Set<string>;
  onSelectRoute: (id: string) => void;
  onSelectExperience: (id: string) => void;
  onSelectStructureNode: (id: string) => void;
  onToggleExpand: (id: string) => void;
  canPaste: boolean;
  onRenameNode: (id: string, label: string) => void;
  onDuplicateNode: (id: string) => void;
  onCopyNode: (id: string) => void;
  onPasteNode: (afterId: string | null) => void;
  onToggleDisabledNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onMoveNode: (parentId: string | null, from: number, to: number) => void;
  onRequestAddLayout: (
    position: "before" | "after" | "end",
    refId: string | null,
    refLabel?: string,
  ) => void;
}

// Explorer region: two persistent panes (collection / STRUCTURE) that scroll
// independently. Navigation only — no editable fields. Expanding a node
// reveals children; selecting an experience loads its Structure; selecting a
// Structure row drives Properties. The collection pane's dataset and header
// follow the active AuthoringContext.
export function Explorer({
  context,
  collectionTree,
  collectionHeader,
  selectedRouteId,
  selectedExperienceId,
  activeExperience,
  selectedStructureNodeId,
  expanded,
  onSelectRoute,
  onSelectExperience,
  onSelectStructureNode,
  onToggleExpand,
  canPaste,
  onRenameNode,
  onDuplicateNode,
  onCopyNode,
  onPasteNode,
  onToggleDisabledNode,
  onDeleteNode,
  onMoveNode,
  onRequestAddLayout,
}: ExplorerProps) {
  const [collectionQuery, setCollectionQuery] = useState("");
  // The highlighted collection row is whichever of route/experience is active.
  const collectionSelectedId = selectedExperienceId ?? selectedRouteId;
  const routeLabel = findRouteLabel(collectionTree, selectedRouteId);
  const structureEmptyNoun = context === "widget" ? "widget config" : "variant";

  // Widget context collapses the collection ("Widget tree") pane to a slim
  // single-line bar by default — the full slug list is rarely useful once a
  // widget is open, and the STRUCTURE tree (Journey / Offers / …) is what
  // authors actually work in, so it should own the height. Clicking the bar
  // reopens the full, resizable list. Page context is unaffected (never
  // collapsed), so its behaviour is unchanged.
  const [widgetPaneCollapsed, setWidgetPaneCollapsed] = useState(true);
  const collectionCollapsed = context === "widget" && widgetPaneCollapsed;
  const currentWidgetLabel = activeExperience?.name ?? routeLabel ?? "—";

  // Pages / Structure split (percentage of the Explorer height for the Pages
  // pane). Default is intentionally compact so Structure gets more room.
  const PAGES_DEFAULT_PCT = 30;
  const [pagesPct, setPagesPct] = useState(PAGES_DEFAULT_PCT);
  const beginPagesResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const container = el.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // Capture on the handle so the drag tracks continuously (no "button-like"
    // stalls) and always releases the cursor on pointerup/cancel.
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setPagesPct(Math.min(80, Math.max(15, pct)));
    };
    const onUp = () => {
      el.releasePointerCapture?.(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "row-resize";
  };

  return (
    // Keep the shell grid contract (.ui-ws__region) on the outer element; the
    // panel internals are fully shadcn/Tailwind (§8). Dark panel surface.
    <Panel className="ui-ws__region" aria-label="Explorer">
      {collectionCollapsed ? (
        // Collapsed "Widget tree": a slim single-line bar showing the open
        // widget. Clicking it reopens the full, resizable collection list.
        <button
          type="button"
          onClick={() => setWidgetPaneCollapsed(false)}
          title="Show widget list"
          aria-label="Show widget list"
          className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <MSym name="chevron_right" size={18} className="shrink-0 text-muted-foreground" />
          <span className={cn("shrink-0", chromeType.panelEyebrow)}>{collectionHeader}</span>
          <span className={cn("min-w-0 flex-1 truncate", chromeType.panelTitle)}>
            {currentWidgetLabel}
          </span>
        </button>
      ) : (
        <>
          {/* Collection pane (PAGES / WIDGETS) — resizable height. */}
          <div
            className="ui-ws-explorer__pane--pages flex min-h-0 shrink-0 grow-0 flex-col border-b border-[var(--color-border-subtle)]"
            style={{ flexBasis: `${pagesPct}%` }}
          >
            <PanelHeader
              eyebrow={collectionHeader}
              // Same disclosure chevron as the collapsed bar, kept flush-left and
              // rotated down to read as "expanded — click to collapse" (so the
              // toggle icon and position match across both states).
              leading={
                context === "widget" ? (
                  <button
                    type="button"
                    onClick={() => setWidgetPaneCollapsed(true)}
                    title="Collapse widget list"
                    aria-label="Collapse widget list"
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <MSym name="chevron_right" size={18} className="rotate-90" />
                  </button>
                ) : undefined
              }
              actions={
                <div className="w-40">
                  <SearchInput
                    value={collectionQuery}
                    onChange={setCollectionQuery}
                    onClear={() => setCollectionQuery("")}
                  />
                </div>
              }
            />
            <ScrollArea className="min-h-0 flex-1">
              <CollectionTree
                key={context}
                context={context}
                tree={collectionTree}
                selectedId={collectionSelectedId}
                onSelectRoute={onSelectRoute}
                onSelectExperience={onSelectExperience}
              />
            </ScrollArea>
          </div>
          {/* Draggable divider between the collection pane and Structure. Same
              line weight/colour as the column dividers, with a horizontal
              3×2-dot grabber centred on it (sits just above the Structure
              header). Net zero height (negative margins) so the panes stay
              flush; the 6px box is the grab target. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize pages panel"
            title="Drag to resize"
            onPointerDown={beginPagesResize}
            onDoubleClick={() => setPagesPct(PAGES_DEFAULT_PCT)}
            className="group relative z-10 -my-1 h-2 shrink-0 cursor-row-resize touch-none select-none"
          >
            {/* Eos §3.6 resizer: 8px hit target (the -my-1 h-2 wrapper above);
                idle 1px transparent-bordered line, hover/active 3px accent. */}
            <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--color-border-strong)] transition-colors group-hover:h-[3px] group-hover:bg-[var(--color-action-primary)]" />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 flex h-4 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-[var(--elevation-1)] transition-colors group-hover:border-[var(--color-action-primary)]"
            >
              <span className="grid grid-flow-col grid-rows-2 gap-[3px]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className="size-[3px] rounded-full bg-[var(--color-text-muted)] transition-colors group-hover:bg-[var(--color-action-primary)]"
                  />
                ))}
              </span>
            </span>
          </div>
        </>
      )}
      {/* Structure pane — fills the remaining height. */}
      <div className="ui-ws-explorer__pane--structure flex min-h-0 flex-1 flex-col bg-[var(--color-bg-panel)]">
        <PanelHeader
          eyebrow="Structure"
          sub={
            context === "widget"
              ? undefined
              : activeExperience
                ? activeExperience.name
                : routeLabel ?? "—"
          }
          className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]"
        />
        <ScrollArea className="min-h-0 flex-1" orientation="both">
          {activeExperience && activeExperience.structure.length === 0 && context === "widget" ? (
            <div className="flex flex-col items-start gap-3 p-4">
              <p className="text-[length:var(--type-body-sm-size)] leading-relaxed text-muted-foreground">
                This widget has no sections yet.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRequestAddLayout("end", null)}
              >
                Start from a layout
              </Button>
            </div>
          ) : activeExperience ? (
            <StructureTree
              nodes={activeExperience.structure}
              selectedId={selectedStructureNodeId}
              expanded={expanded}
              allowInsert
              allowRowActions
              minimalRowActions={context === "widget"}
              grouped={context === "widget"}
              noTrailingFade={context === "widget"}
              onSelect={onSelectStructureNode}
              onToggle={onToggleExpand}
              actions={{
                canPaste,
                onRenameNode,
                onDuplicateNode,
                onCopyNode,
                onPasteNode,
                onToggleDisabledNode,
                onDeleteNode,
                onMoveNode,
                onRequestAddLayout,
              }}
            />
          ) : (
            <p className="m-3 text-[length:var(--type-body-sm-size)] leading-relaxed text-muted-foreground">
              Select a {structureEmptyNoun} to view its structure.
            </p>
          )}
        </ScrollArea>
      </div>
    </Panel>
  );
}
