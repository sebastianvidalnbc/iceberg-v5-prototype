import * as React from "react";
import { MSym } from "@/v4-eos/ui/msym";
import { cn } from "@/v4-eos/ui/lib/utils";
import { WIDGET_FAMILY_HUE, type WidgetType } from "@/v4-eos/browse";
import type { StructureLabelWeight } from "@/v4-eos/ui/structure-tree-visual";

const INDENT_PX = 12;
const ROW_CLASS =
  "structure-tree-row group/row relative flex cursor-pointer items-center gap-0.5 rounded-[var(--radius-sm)] pr-2 font-[family-name:var(--font-sans)] text-[length:var(--structure-tree-size)] leading-[length:var(--structure-tree-lh)] transition-colors";

export interface StructureTreeRowProps {
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  selected: boolean;
  label: React.ReactNode;
  labelWeight?: StructureLabelWeight;
  icon?: string;
  trailing?: React.ReactNode;
  grip?: React.ReactNode;
  dropHandlers?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
  isOver?: boolean;
  disabled?: boolean;
  fluid?: boolean;
  boxed?: boolean;
  noTrailingFade?: boolean;
  famType?: WidgetType;
  /** Secondary label colour (alternatives beside an anchor row). */
  muted?: boolean;
  /** No icon column: the label sits right after the disclosure chevron. */
  noIconSlot?: boolean;
  /** Content Pages outline: reads as a fill-out section that opens Properties. */
  sectionEntry?: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

export function StructureTreeRow({
  depth,
  hasChildren,
  isOpen,
  selected,
  label,
  labelWeight = "regular",
  icon,
  trailing,
  grip,
  dropHandlers,
  isDragging,
  isOver,
  disabled,
  fluid,
  boxed,
  noTrailingFade,
  famType,
  muted,
  noIconSlot,
  sectionEntry,
  onSelect,
  onToggle,
}: StructureTreeRowProps) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = rowRef.current;
    if (selected && el) {
      // Reveal vertically only: a deep selected row must not pan the tree
      // sideways, which would push the layout gutter out of view.
      const scrollers: [HTMLElement, number][] = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.scrollWidth > p.clientWidth) scrollers.push([p, p.scrollLeft]);
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      for (const [s, x] of scrollers) s.scrollLeft = x;
    }
  }, [selected]);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? isOpen : undefined}
      data-drag-row
      onClick={onSelect}
      {...dropHandlers}
      style={
        sectionEntry
          ? {
              marginLeft: `calc(var(--space-1) + ${depth} * 32px)`,
              marginRight: "var(--space-1)",
              paddingLeft: "var(--space-3)",
              paddingRight: "var(--space-2)",
            }
          : { paddingLeft: `calc(var(--structure-tree-pad-x) + ${depth} * ${INDENT_PX}px)` }
      }
      className={cn(
        ROW_CLASS,
        sectionEntry
          ? "min-h-[36px] text-[length:var(--type-body-md-size)] leading-[length:var(--type-body-md-lh)]"
          : "min-h-[var(--structure-tree-row-h)]",
        fluid && "w-max min-w-full",
        sectionEntry &&
          !selected &&
          "bg-[var(--color-bg-elevated)] shadow-[inset_0_0_0_1px_var(--color-border-subtle)] hover:shadow-[inset_0_0_0_1px_var(--color-border-default)]",
        !selected &&
          !boxed &&
          !sectionEntry &&
          "hover:bg-[var(--color-bg-hover)] [--row-bg:var(--structure-tree-canvas,var(--color-bg-panel))] hover:[--row-bg:var(--color-bg-hover)]",
        sectionEntry &&
          !selected &&
          "hover:bg-[var(--color-bg-hover)] [--row-bg:var(--color-bg-hover)]",
        selected &&
          !boxed &&
          "bg-[var(--color-bg-selected)] [--row-bg:var(--color-bg-selected)] text-foreground",
        selected && boxed && "text-foreground",
        isDragging && "opacity-40",
        isOver &&
          "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[var(--color-action-primary)] before:content-['']",
        disabled && "opacity-55",
      )}
    >
      {!sectionEntry && (
        <span className="flex w-4 shrink-0 items-center justify-center">{grip}</span>
      )}
      {hasChildren ? (
        <button
          type="button"
          aria-label={isOpen ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-field)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus-ring)]"
        >
          <MSym
            name="chevron_right"
            size={16}
            className={cn("transition-transform duration-150", isOpen && "rotate-90")}
          />
        </button>
      ) : sectionEntry ? null : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      {famType ? (
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
          <span
            className="size-1.5 rounded-full"
            style={{ background: WIDGET_FAMILY_HUE[famType].fam }}
          />
        </span>
      ) : icon ? (
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center text-[var(--color-text-muted)]"
        >
          <MSym name={icon} size={16} />
        </span>
      ) : sectionEntry || noIconSlot ? null : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      <span
        className={cn(
          sectionEntry
            ? "min-w-0 flex-1 whitespace-normal py-2"
            : "min-w-0 flex-1 truncate",
          muted
            ? "font-normal text-[var(--color-text-secondary)]"
            : labelWeight === "medium"
              ? "font-medium text-foreground"
              : "font-normal text-foreground/90",
          disabled && "line-through",
        )}
      >
        {label}
      </span>
      {sectionEntry && !hasChildren && !trailing && (
        <span
          aria-hidden
          className={cn(
            "ml-1 shrink-0 text-[var(--color-text-muted)] transition-colors",
            selected && "text-[var(--color-action-primary)]",
          )}
        >
          <MSym name="chevron_right" size={18} />
        </span>
      )}
      {trailing != null && (
        <span
          className={cn(
            "sticky right-0 z-10 ml-auto flex shrink-0 items-center gap-0.5 pl-2 pr-3 transition-opacity",
            !noTrailingFade && "[background:var(--row-bg)]",
            !noTrailingFade &&
              "before:pointer-events-none before:absolute before:right-full before:top-0 before:h-full before:w-6 before:content-['']",
            !noTrailingFade &&
              "before:bg-[linear-gradient(to_right,transparent,var(--row-bg))]",
            "opacity-0 group-hover/row:opacity-100 focus-within:opacity-100",
            "group-has-[[data-state=open]]:opacity-100",
            selected && "opacity-100",
          )}
        >
          {trailing}
        </span>
      )}
    </div>
  );
}
