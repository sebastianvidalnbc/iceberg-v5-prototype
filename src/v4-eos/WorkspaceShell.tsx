import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AppShell } from "./AppShell";
import { widgetCollectionTree } from "./widget-create";
import { Explorer } from "./regions/Explorer";
import { LivePreview } from "./regions/LivePreview";
import { Properties } from "./regions/Properties";
import { Breadcrumb } from "./ui-lib/Breadcrumb";
import { Icon } from "./ui-lib/Icon";
import { Button } from "@/v4-eos/ui/button";
import {
  getVariant,
  seedExpandedFor,
  VARIANTS,
  DEFAULT_VARIANT_ID,
  isVariantId,
  getWidgetConfig,
  isWidgetConfigId,
  seedWidgetExpandedFor,
  WIDGET_CONFIGS,
  DEFAULT_WIDGET_CONFIG_ID,
  PAGES_TREE,
  findNode,
  type AuthoringContext,
  type NavDestination,
} from "./data";
import { findPageForVariant, routes, navigate } from "./browse";
import {
  appendChild,
  cloneKeepIds,
  cloneWithNewIds,
  deleteNode,
  ancestorIdsOf,
  duplicateNode,
  findNodeById,
  insertAfter,
  insertBefore,
  moveWithin,
  renameNode,
  setNodeContent,
  toggleDisabled,
} from "./structureOps";
import type { StructureNode, StructureObjectType } from "./data";
import { collectVariationNodes, derivePreviewModel } from "./previewModel";
import { isNameField } from "./structure-panel";
import { collectInvalidFields } from "./validate";
import { LayoutPicker } from "./regions/LayoutPicker";
import {
  PrePublishDialog,
  ScheduleDialog,
  HistoryDialog,
} from "./regions/WidgetActionDialogs";
import { buildLayoutNode, createChildNode, getLayoutDef } from "./layouts";
import { buildSchemaChild } from "./schemaModel";

// Per-experience Explorer memory: which Structure nodes are expanded and which
// object is selected. Keeping this keyed by experience (Variant or Widget
// config) lets switching back restore prior expansion/selection, and guarantees
// we never carry an invalid Structure selection from one experience to another.
interface ExperienceMemory {
  expanded: Set<string>;
  selectedNodeId: string;
  // Editable copy of the experience's Structure tree (drag-reorder + row
  // actions mutate this, never the shared static dataset).
  structure: StructureNode[];
}

function seedMemory(variantId: string): ExperienceMemory {
  const variant = VARIANTS[variantId];
  return {
    expanded: seedExpandedFor(variantId),
    selectedNodeId: variant ? variant.defaultSelectionId : "",
    structure: variant ? cloneKeepIds(variant.structure) : [],
  };
}

function seedWidgetMemory(configId: string): ExperienceMemory {
  const config = WIDGET_CONFIGS[configId];
  return {
    expanded: seedWidgetExpandedFor(configId),
    selectedNodeId: config ? config.defaultSelectionId : "",
    structure: config ? cloneKeepIds(config.structure) : [],
  };
}

// Persistent four-region authoring shell and the single owner of selection
// state. The active AuthoringContext ("page" | "widget") selects which dataset
// feeds Explorer / Live Preview / Properties. Each context keeps its own,
// fully independent selection + memory, so switching Page↔Widget never mutates
// or overwrites the other context's state.
//
// Per context, three distinct concepts are tracked and never conflated:
//   selected route id      — a route row in the collection tree
//   selected experience id — the active Variant / Widget config (drives regions)
//   selectedStructureNodeId — the selected object within the active experience
// `initialContext` + `initialVariantId` come from the
// #/editor/:context/:id route so a deep link opens straight into the right
// authoring context AND experience — this is what makes the editor "dynamic":
// opening a Widget boots the shell in widget context (Widgets breadcrumb +
// widget Structure tree), opening a Page boots it in page context. Unknown ids
// fall back to that context's default so the editor always renders a populated
// workspace of the CORRECT kind.
export function WorkspaceShell({
  initialContext = "page",
  initialVariantId,
}: {
  initialContext?: AuthoringContext;
  initialVariantId?: string;
}) {
  const openVariantId =
    initialVariantId && isVariantId(initialVariantId)
      ? initialVariantId
      : DEFAULT_VARIANT_ID;
  // Widget deep-link target: use the id when it's a real widget config,
  // otherwise the default widget config (so the widget tree still renders).
  const openWidgetConfigId =
    initialVariantId && isWidgetConfigId(initialVariantId)
      ? initialVariantId
      : DEFAULT_WIDGET_CONFIG_ID;

  const [context, setContext] = useState<AuthoringContext>(initialContext);

  // --- Page context state (unchanged behaviour) ---------------------------
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    openVariantId
  );
  const [pageMemory, setPageMemory] = useState<Record<string, ExperienceMemory>>(
    () => ({ [openVariantId]: seedMemory(openVariantId) })
  );

  // --- Widget context state (independent) ---------------------------------
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedWidgetConfigId, setSelectedWidgetConfigId] = useState<
    string | null
  >(openWidgetConfigId);
  const [widgetMemory, setWidgetMemory] = useState<
    Record<string, ExperienceMemory>
  >(() => ({ [openWidgetConfigId]: seedWidgetMemory(openWidgetConfigId) }));

  // Structure clipboard for Copy/Paste, shared across experiences (mirrors V1).
  const [clipboard, setClipboard] = useState<StructureNode | null>(null);

  // Layout Picker target: where a newly chosen premade layout will be inserted.
  // null ⇒ the picker is closed. `refId` is the top-level section the insert is
  // relative to (null for "append to end").
  const [layoutPicker, setLayoutPicker] = useState<{
    position: "before" | "after" | "end";
    refId: string | null;
    refLabel?: string;
  } | null>(null);

  // Widget action-bar flows (§7 Schedule, §8 History, §9 Pre-publish). Publish
  // routes through a confirm dialog; a scheduled release surfaces as a chip; the
  // History button carries an unseen-activity dot until it's first opened.
  const [prePublishOpen, setPrePublishOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [historySeen, setHistorySeen] = useState(false);

  // MVT / A-B override: a variation id to PREVIEW instead of the current
  // selection (the mvtOverride analog — preview-only, never mutates data). ""
  // means "as authored" (derive from the selected node).
  const [mvtOverride, setMvtOverride] = useState<string>("");

  // Resizable Explorer column: the author can drag the divider between the
  // tree/collection pane and the preview to widen the tree (up to a max). The
  // default is PER-CONTEXT and remembered independently: widget authoring lives
  // almost entirely in the STRUCTURE tree (Journey / Offers / …) and barely uses
  // the preview, so the Widget context opens the column wider than Pages.
  const EXPLORER_MIN = 240;
  const EXPLORER_MAX = 560;
  const EXPLORER_DEFAULTS: Record<AuthoringContext, number> = {
    page: 280,
    widget: 420,
  };
  const [explorerWidths, setExplorerWidths] =
    useState<Record<AuthoringContext, number>>(EXPLORER_DEFAULTS);
  const explorerWidth = explorerWidths[context];
  const beginExplorerResize = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      // Capture the pointer on the handle itself so drag events keep flowing
      // even as the cursor moves OVER the preview iframe (an iframe otherwise
      // swallows window-level pointer events, killing the drag mid-way and
      // leaving the cursor/hover stuck because pointerup never fires).
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = explorerWidths[context];
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          EXPLORER_MAX,
          Math.max(EXPLORER_MIN, startW + (ev.clientX - startX)),
        );
        setExplorerWidths((prev) => ({ ...prev, [context]: next }));
      };
      const onUp = () => {
        el.releasePointerCapture?.(e.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [explorerWidths, context],
  );

  const isPage = context === "page";

  // Resolve the region-facing values from whichever context is active.
  const widgetTree = useMemo(() => widgetCollectionTree(), []);
  const collectionTree = isPage ? PAGES_TREE : widgetTree;
  const collectionHeader = isPage ? "Pages" : "Widgets";
  const selectedRouteId = isPage ? selectedPageId : selectedWidgetId;
  const selectedExperienceId = isPage ? selectedVariantId : selectedWidgetConfigId;
  const baseExperience = isPage
    ? getVariant(selectedVariantId)
    : getWidgetConfig(selectedWidgetConfigId);
  const memory = isPage ? pageMemory : widgetMemory;
  const active = selectedExperienceId ? memory[selectedExperienceId] : undefined;
  // The experience handed to the regions carries the EDITABLE structure (from
  // per-experience memory) rather than the shared static one, so drag-reorder
  // and row actions are reflected everywhere (Explorer, Preview, Properties).
  const activeExperience = baseExperience
    ? { ...baseExperience, structure: active?.structure ?? baseExperience.structure }
    : null;
  const selectedStructureNodeId = active?.selectedNodeId ?? null;
  const expanded = active?.expanded ?? new Set<string>();

  // The currently selected Structure object, resolved once from the active
  // experience's structure. Drives the Live Preview so the canvas reflects which
  // object (and, for Sections, which page role) the author is editing — the
  // workshop's "which section does this field control?" ask. Null when a route
  // (not an experience) is selected or nothing is selected.
  const selectedNode =
    activeExperience && selectedStructureNodeId
      ? findNode(activeExperience.structure, selectedStructureNodeId)
      : null;
  const selectedObject = selectedNode
    ? {
        label: selectedNode.label,
        role: selectedNode.role ?? null,
        objectType: selectedNode.objectType ?? null,
      }
    : null;

  // Switch the major authoring context. Each context preserves its own prior
  // selection because we never touch the other context's state here.
  const handleSelectContext = useCallback((next: NavDestination) => {
    if (next === "contentPage") {
      navigate(routes.contentPages());
      return;
    }
    setContext(next);
  }, []);

  // Click a route row: select it, clear the active experience (and its Structure
  // selection) for the current context only.
  const handleSelectRoute = useCallback(
    (routeId: string) => {
      if (isPage) {
        setSelectedPageId(routeId);
        setSelectedVariantId(null);
      } else {
        setSelectedWidgetId(routeId);
        setSelectedWidgetConfigId(null);
      }
    },
    [isPage]
  );

  // Click an experience (Variant / Widget config): make it active, seed its
  // memory if unseen, and clear any route selection — for the current context.
  const handleSelectExperience = useCallback(
    (experienceId: string) => {
      if (isPage) {
        setSelectedPageId(null);
        setSelectedVariantId(experienceId);
        setPageMemory((prev) =>
          prev[experienceId] ? prev : { ...prev, [experienceId]: seedMemory(experienceId) }
        );
      } else {
        setSelectedWidgetId(null);
        setSelectedWidgetConfigId(experienceId);
        setWidgetMemory((prev) =>
          prev[experienceId]
            ? prev
            : { ...prev, [experienceId]: seedWidgetMemory(experienceId) }
        );
      }
    },
    [isPage]
  );

  // Click a Structure node (in the tree OR the preview): select it AND expand
  // every ancestor so the tree "focuses" on it — the author never has to chase a
  // deep field/component down the tree. The Explorer then scrolls it into view.
  const handleSelectStructureNode = useCallback(
    (nodeId: string) => {
      if (!selectedExperienceId) return;
      const setter = isPage ? setPageMemory : setWidgetMemory;
      setter((prev) => {
        const cur = prev[selectedExperienceId];
        if (!cur) return prev;
        const expanded = new Set(cur.expanded);
        for (const a of ancestorIdsOf(cur.structure, nodeId)) expanded.add(a);
        return {
          ...prev,
          [selectedExperienceId]: { ...cur, selectedNodeId: nodeId, expanded },
        };
      });
    },
    [isPage, selectedExperienceId]
  );

  // Toggle a Structure node's expansion for the active experience only.
  const handleToggleExpand = useCallback(
    (nodeId: string) => {
      if (!selectedExperienceId) return;
      const setter = isPage ? setPageMemory : setWidgetMemory;
      setter((prev) => {
        const cur = prev[selectedExperienceId];
        const next = new Set(cur.expanded);
        next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
        return { ...prev, [selectedExperienceId]: { ...cur, expanded: next } };
      });
    },
    [isPage, selectedExperienceId]
  );

  // --- Structure authoring: drag-reorder + row actions --------------------
  // All ops route through the active experience's editable structure memory.
  const updateStructure = useCallback(
    (
      updater: (nodes: StructureNode[]) => StructureNode[],
      nextSelectedId?: string,
    ) => {
      if (!selectedExperienceId) return;
      const setter = isPage ? setPageMemory : setWidgetMemory;
      setter((prev) => {
        const cur = prev[selectedExperienceId];
        if (!cur) return prev;
        return {
          ...prev,
          [selectedExperienceId]: {
            ...cur,
            structure: updater(cur.structure),
            ...(nextSelectedId !== undefined
              ? { selectedNodeId: nextSelectedId }
              : {}),
          },
        };
      });
    },
    [isPage, selectedExperienceId]
  );

  const handleRenameNode = useCallback(
    (nodeId: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      updateStructure((nodes) => renameNode(nodes, nodeId, trimmed));
    },
    [updateStructure]
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => updateStructure((nodes) => duplicateNode(nodes, nodeId)),
    [updateStructure]
  );

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const nodes = active?.structure ?? [];
      const found = findNodeById(nodes, nodeId);
      if (found) setClipboard(cloneWithNewIds(found));
    },
    [active]
  );

  const handlePasteNode = useCallback(
    (afterId: string | null) => {
      if (!clipboard) return;
      // Fresh ids each paste so repeated pastes never collide.
      const toInsert = cloneWithNewIds(clipboard);
      updateStructure(
        (nodes) => insertAfter(nodes, afterId, toInsert),
        toInsert.id,
      );
    },
    [clipboard, updateStructure]
  );

  const handleToggleDisabled = useCallback(
    (nodeId: string) => updateStructure((nodes) => toggleDisabled(nodes, nodeId)),
    [updateStructure]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // If the deleted node is currently selected, clear the selection.
      const clearSel = selectedStructureNodeId === nodeId;
      updateStructure(
        (nodes) => deleteNode(nodes, nodeId),
        clearSel ? "" : undefined,
      );
    },
    [updateStructure, selectedStructureNodeId]
  );

  const handleMoveNode = useCallback(
    (parentId: string | null, from: number, to: number) =>
      updateStructure((nodes) => moveWithin(nodes, parentId, from, to)),
    [updateStructure]
  );

  // --- Page builder: add a premade LAYOUT (a new top-level section) ---------
  // Open the Layout Picker, targeting an insert position relative to a section.
  const handleRequestAddLayout = useCallback(
    (position: "before" | "after" | "end", refId: string | null, refLabel?: string) => {
      setLayoutPicker({ position, refId, refLabel });
    },
    []
  );

  // Apply the chosen layout: build a fresh pre-filled section subtree and insert
  // it at the target slot, then select + expand it so the author lands on it.
  const handleChooseLayout = useCallback(
    (layoutId: string) => {
      const def = getLayoutDef(layoutId);
      if (!def || !selectedExperienceId || !layoutPicker) return;
      const node = buildLayoutNode(def);
      const { position, refId } = layoutPicker;
      const setter = isPage ? setPageMemory : setWidgetMemory;
      setter((prev) => {
        const cur = prev[selectedExperienceId];
        if (!cur) return prev;
        const structure =
          position === "before"
            ? insertBefore(cur.structure, refId, node)
            : insertAfter(cur.structure, refId, node); // "after" or "end" (refId null)
        const expanded = new Set(cur.expanded).add(node.id);
        return {
          ...prev,
          [selectedExperienceId]: {
            ...cur,
            structure,
            expanded,
            selectedNodeId: node.id,
          },
        };
      });
      setLayoutPicker(null);
    },
    [isPage, selectedExperienceId, layoutPicker]
  );

  // Add a CHILD to a container (the "Add {itemNoun}" / add-plan action). Builds a
  // default instance of the container's child type, appends it, then selects +
  // expands the parent so the new card/row is visible and editable.
  const handleAddChild = useCallback(
    (parentId: string, childType: StructureObjectType) => {
      if (!selectedExperienceId) return;
      const setter = isPage ? setPageMemory : setWidgetMemory;
      setter((prev) => {
        const cur = prev[selectedExperienceId];
        if (!cur) return prev;
        // Schema-driven collections build their item from the schema captured on
        // the parent (childSchema); everything else uses the registry factory.
        const parent = findNodeById(cur.structure, parentId);
        const child =
          (parent && buildSchemaChild(parent)) ?? createChildNode(childType);
        const structure = appendChild(cur.structure, parentId, child);
        const expanded = new Set(cur.expanded).add(parentId);
        return {
          ...prev,
          [selectedExperienceId]: {
            ...cur,
            structure,
            expanded,
            selectedNodeId: child.id,
          },
        };
      });
    },
    [isPage, selectedExperienceId]
  );

  // Edit a property field on the selected object (live). This writes the value
  // onto the element INSTANCE's `content` within the variant's Structure — the
  // V4 analog of updatePlaceholderContentByPath — so the edit persists on the
  // instance and drives both the Properties panel and the live preview.
  // A title field also names its node (see isNameField): editing it renames the
  // node, so the tree and the panel's tabs show the title the author set.
  const handleEditField = useCallback(
    (nodeId: string, label: string, value: string) => {
      updateStructure((nodes) => {
        const next = setNodeContent(nodes, nodeId, label, value);
        const node = findNodeById(nodes, nodeId);
        const title = value.trim();
        return node && isNameField(node, label) && title ? renameNode(next, nodeId, title) : next;
      });
    },
    [updateStructure]
  );

  // The selected instance's authored VALUES.
  const selectedNodeContent: Record<string, string> = selectedNode?.content ?? {};

  // MVT variations available in this experience, and the derived preview. When
  // an MVT override is active the canvas renders that variation's subtree;
  // otherwise it follows the tree selection.
  const variations = collectVariationNodes(activeExperience);
  // Drop a stale override if the active experience no longer has that variation.
  useEffect(() => {
    if (mvtOverride && !variations.some((v) => v.id === mvtOverride)) {
      setMvtOverride("");
    }
  }, [mvtOverride, variations]);
  // The preview composes the WHOLE variant (all sections) and is independent of
  // which layer is selected — selection only drives the edit panel + highlight.
  // It changes on variant switch, live field edits, or an MVT variation choice.
  const previewModel = derivePreviewModel(activeExperience, mvtOverride || null);

  // Validation across the whole experience (the invalidSections analog). Feeds
  // the save gate in the editor bar and the inline invalid marks on the selected
  // object's required fields.
  const issues = collectInvalidFields(activeExperience);
  const selectedInvalidFields = new Set(
    issues
      .filter((i) => i.nodeId === selectedStructureNodeId)
      .map((i) => i.field)
  );

  // Breadcrumb keeps the author oriented ("Where am I?"): <Collection> / /slug /
  // <experience>. Crumbs navigate back up the browse flow via hash routes, and
  // are context-aware. Pages have a per-slug Variants level; Widgets are a single
  // inline-expandable list, so a widget's owner crumb points back to that list.
  const activeExperienceId =
    selectedExperienceId ?? (isPage ? openVariantId : openWidgetConfigId);
  const ownerPage = findPageForVariant(activeExperienceId, context);
  const activeName = activeExperience?.name ?? activeExperienceId;
  const rootCrumb = isPage
    ? { label: "Pages", href: routes.pages() }
    : { label: "Widgets", href: routes.widgets() };
  // For Pages the owner slug links to its Variants list; for Widgets there is no
  // sub-page, so the owner slug links back to the single Widgets list.
  const ownerHref = ownerPage
    ? isPage
      ? routes.variants(ownerPage.id)
      : routes.widgets()
    : "";
  const crumbs = [
    { label: rootCrumb.label, href: rootCrumb.href, onClick: () => navigate(rootCrumb.href) },
    ...(ownerPage
      ? [
          {
            label: ownerPage.label,
            href: ownerHref,
            onClick: () => navigate(ownerHref),
          },
        ]
      : []),
    { label: activeName },
  ];

  // The persistent rail is provided by AppShell (shared across all V2 levels).
  // In the editor the rail keeps its original behaviour: clicking Pages/Widgets
  // swaps the in-editor dataset via handleSelectContext rather than navigating
  // away. Below the rail sits the breadcrumb bar and the three editing regions.
  return (
    <AppShell activeContext={context} onSelectContext={handleSelectContext}>
      <div className="ui-ws-editor">
        <div className="ui-ws-editor__bar">
          {/* Widgets use the compact, ellipsis-truncated breadcrumb so long
              slugs/names don't wrap the top bar on small screens. */}
          <Breadcrumb items={crumbs} truncate={!isPage} />
          {/* Widget header metadata — only the publish status is shown beside
              the variant name; the fixed Format ("JSON") / Widget Type
              ("Retention Service") pills were dropped to keep the bar compact. */}
          {!isPage && activeExperience && (
            <div className="ml-3 flex items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[length:var(--type-label-badge-size)] leading-[length:var(--type-label-badge-lh)] font-semibold"
                style={{
                  background: "var(--color-status-success-bg)",
                  color: "var(--color-status-success)",
                }}
              >
                Published
              </span>
            </div>
          )}
          {/* Right cluster: the real Iceberg editor action set. These are all
              secondary actions (no filled primary) — the save gate stays (Save
              is blocked while required fields are empty, the checkValidationErrors
              analog). Core workflow CTAs are labelled; QA + metadata tools are
              icon buttons with tooltips to keep the bar compact. */}
          {activeExperience && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  window.open(
                    `${import.meta.env.BASE_URL}renderer.html`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                <Icon name="preview" size={16} />
                Preview
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {}}>
                <Icon name="variants" size={16} />
                Variants
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Widgets go through the pre-publish summary (§9); pages keep
                  // their existing (stubbed) publish path.
                  if (!isPage) setPrePublishOpen(true);
                }}
              >
                <Icon name="publish" size={16} />
                Publish
              </Button>
              {/* §7 Schedule a future release — widget-only, mirrors the
                  scheduled-publish other Iceberg surfaces support. */}
              {!isPage && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setScheduleOpen(true)}
                >
                  <Icon name="schedule" size={16} />
                  Schedule
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => {}}>
                <Icon name="send-qa" size={16} />
                Send To QA
              </Button>
              {/* §7 Scheduled-release chip — a persistent reminder that a future
                  publish is queued, with a quick way to clear it. */}
              {!isPage && scheduledAt && (
                <span
                  className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[length:var(--type-label-badge-size)] leading-[length:var(--type-label-badge-lh)] font-medium"
                  style={{
                    background: "var(--color-status-warning-bg)",
                    color: "var(--color-status-warning)",
                  }}
                >
                  <Icon name="schedule" size={14} />
                  Scheduled ·{" "}
                  {new Date(scheduledAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  <button
                    type="button"
                    aria-label="Cancel scheduled release"
                    className="ml-0.5 inline-flex"
                    onClick={() => setScheduledAt(null)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </span>
              )}
              {/* Auto-save: this redesign persists edits automatically, so there
                  is no Save CTA — just a passive status. Required-field
                  validation still surfaces as a non-blocking hint beside it. */}
              <span
                className="ui-cta-tip inline-flex items-center gap-1 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium text-[var(--color-text-muted)]"
                data-tip="All changes saved automatically"
              >
                <Icon name="check" size={16} />
                Saved
              </span>
              {issues.length > 0 && (
                <span
                  className="ui-cta-tip inline-flex items-center gap-1 text-[length:var(--type-label-md-size)] leading-[length:var(--type-label-md-lh)] font-medium"
                  data-tip={`${issues.length} required field${
                    issues.length === 1 ? "" : "s"
                  } need attention before publishing`}
                  style={{
                    color:
                      "var(--color-status-warning, var(--color-text-secondary))",
                  }}
                >
                  <Icon name="warning" size={16} />
                  {issues.length} to fix
                </span>
              )}

              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--color-border-default)]"
              />

              {/* QA tools — available in QA states; disabled by default (matches
                  the real editor's greyed QA Review / QA Notes). Icon-only CTAs
                  use the instant .ui-cta-tip tooltip (same treatment as the rail),
                  not the delayed native title. */}
              <span className="ui-cta-tip" data-tip="QA Review">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled
                  aria-label="QA Review"
                  onClick={() => {}}
                >
                  <Icon name="qa-review" size={18} />
                </Button>
              </span>
              <span className="ui-cta-tip" data-tip="QA Notes">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled
                  aria-label="QA Notes"
                  onClick={() => {}}
                >
                  <Icon name="qa-notes" size={18} />
                </Button>
              </span>

              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--color-border-default)]"
              />

              {/* Metadata / config tools. CSS + JSON-LD are page-only in the
                  real editor (hidden for JSON widgets), so they only render in
                  page context; Settings shows for both. */}
              {isPage && (
                <>
                  <span className="ui-cta-tip" data-tip="CSS">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="CSS"
                      onClick={() => {}}
                    >
                      <Icon name="css" size={18} />
                    </Button>
                  </span>
                  <span className="ui-cta-tip" data-tip="JSON-LD">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="JSON-LD"
                      onClick={() => {}}
                    >
                      <Icon name="json-ld" size={18} />
                    </Button>
                  </span>
                </>
              )}
              {/* §8 Publish / release history — widget-only. An unseen-activity
                  dot draws attention until the author opens it once. */}
              {!isPage && (
                <span className="ui-cta-tip" data-tip="Publish history">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Publish history"
                    className="relative"
                    onClick={() => {
                      setHistoryOpen(true);
                      setHistorySeen(true);
                    }}
                  >
                    <Icon name="history" size={18} />
                    {!historySeen && (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--color-status-warning)" }}
                      />
                    )}
                  </Button>
                </span>
              )}
              <span className="ui-cta-tip" data-tip="Settings">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Settings"
                  onClick={() => {}}
                >
                  <Icon name="settings" size={18} />
                </Button>
              </span>
            </div>
          )}
        </div>
        <div
          className="ui-ws"
          // Only the drag-resizable Explorer width is set inline; the actual
          // `grid-template-columns` declaration (and its <=900px stacked
          // override) lives in eos.css keyed off this custom property, so a
          // narrow-viewport media query can still win over the per-render
          // inline style (Eos §4 layout / responsive alignment).
          style={{ "--ws-explorer-w": `${explorerWidth}px` } as CSSProperties}
        >
          <Explorer
            context={context}
            collectionTree={collectionTree}
            collectionHeader={collectionHeader}
            selectedRouteId={selectedRouteId}
            selectedExperienceId={selectedExperienceId}
            activeExperience={activeExperience}
            selectedStructureNodeId={selectedStructureNodeId}
            expanded={expanded}
            onSelectRoute={handleSelectRoute}
            onSelectExperience={handleSelectExperience}
            onSelectStructureNode={handleSelectStructureNode}
            onToggleExpand={handleToggleExpand}
            canPaste={clipboard != null}
            onRenameNode={handleRenameNode}
            onDuplicateNode={handleDuplicateNode}
            onCopyNode={handleCopyNode}
            onPasteNode={handlePasteNode}
            onToggleDisabledNode={handleToggleDisabled}
            onDeleteNode={handleDeleteNode}
            onMoveNode={handleMoveNode}
            onRequestAddLayout={handleRequestAddLayout}
          />
          {/* Drag handle: resize the Explorer column (tree/collection) against
              the preview, up to a max width. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize structure panel"
            title="Drag to resize"
            onPointerDown={beginExplorerResize}
            onDoubleClick={() =>
              setExplorerWidths((prev) => ({
                ...prev,
                [context]: EXPLORER_DEFAULTS[context],
              }))
            }
            className="group relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none select-none"
          >
            {/* Divider line — same weight/colour as the Properties panel's.
                Eos §3.6 resizer: 8px hit target (the -mx-1 w-2 wrapper above);
                idle 1px, hover/active 3px accent. */}
            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-border-strong)] transition-colors group-hover:w-[3px] group-hover:bg-[var(--color-action-primary)]" />
            {/* Grabber affordance: a 2×3-dot pill centred on the divider so it
                reads as a draggable handle. Pointer events bubble to the parent
                so grabbing it starts the resize. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-[var(--elevation-1)] transition-colors group-hover:border-[var(--color-action-primary)]"
            >
              <span className="grid grid-cols-2 gap-[3px]">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className="size-[3px] rounded-full bg-[var(--color-text-muted)] transition-colors group-hover:bg-[var(--color-action-primary)]"
                  />
                ))}
              </span>
            </span>
          </div>
          <LivePreview
            variant={activeExperience}
            context={context}
            selectedObject={selectedObject}
            previewModel={previewModel}
            selectedId={selectedStructureNodeId}
            onPickSection={handleSelectStructureNode}
            variations={variations}
            mvtOverride={mvtOverride}
            onMvtChange={setMvtOverride}
          />
          <Properties
            context={context}
            variant={activeExperience}
            selectedRouteId={selectedRouteId}
            selectedStructureNodeId={selectedStructureNodeId}
            selectedObjectType={selectedNode?.objectType ?? null}
            content={selectedNodeContent}
            invalidFields={selectedInvalidFields}
            onEditField={handleEditField}
            onAddChild={handleAddChild}
            onRemoveChild={handleDeleteNode}
            onReorderChild={handleMoveNode}
            onSelectStructureNode={handleSelectStructureNode}
          />
        </div>
      </div>
      {/* Page-builder: the Layout Picker modal (opened from the Structure pane's
          "+ Add layout" affordances). Selecting inserts a pre-filled section. */}
      <LayoutPicker
        open={layoutPicker != null}
        onOpenChange={(open) => {
          if (!open) setLayoutPicker(null);
        }}
        onSelect={handleChooseLayout}
        contextLabel={
          layoutPicker
            ? layoutPicker.position === "end"
              ? "at the end of the page"
              : `${layoutPicker.position === "before" ? "above" : "below"} ${
                  layoutPicker.refLabel ?? "this section"
                }`
            : undefined
        }
      />
      {/* Widget action-bar flows (§7 Schedule, §8 History, §9 Pre-publish). */}
      <PrePublishDialog
        open={prePublishOpen}
        onOpenChange={setPrePublishOpen}
        onConfirm={() => {}}
        variant={activeExperience}
        issueCount={issues.length}
        env="Production"
      />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSchedule={(whenIso) => setScheduledAt(whenIso)}
      />
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </AppShell>
  );
}
