import { Fragment, useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../ui-lib/Button";
import { Badge } from "../ui-lib/Badge";
import { MSym } from "../ui/msym";
import { SearchInput } from "../ui-lib/TextInput";
import { FilterChip } from "../ui-lib/FilterChip";
import { TableFooter } from "../ui-lib/TableFooter";
import { EmptyState } from "../ui-lib/EmptyState";
import { buildWidgetRows, routes, navigate, type WidgetRow, type WidgetFormat, type WidgetType } from "../browse";
import type { WidgetChildRow } from "../browse";
import { SortHeaderCell, compareSortValues, nextSort, type SortState } from "../ui-lib/SortableHeader";
import { LayoutPicker } from "../regions/LayoutPicker";
import { createWidgetFromLayout } from "../widget-create";
import { LAYOUT_TYPES, layoutTypeOf, type LayoutTypeId } from "../layout-identity";
import { layoutDefForWidget } from "../layout-widgets";

type SortKey = "slug" | "widgetName" | "createdAt" | "modifiedAt";

const SORT_HEADERS: { key: SortKey; label: string }[] = [
  { key: "slug", label: "Slug" },
  { key: "widgetName", label: "Name" },
  { key: "createdAt", label: "Created" },
  { key: "modifiedAt", label: "Modified" },
];

function sortValue(row: WidgetRow, key: SortKey): string | number {
  switch (key) {
    case "slug":
      return row.slug;
    case "widgetName":
      return row.widgetName;
    case "createdAt":
      return row.createdAt;
    case "modifiedAt":
      return row.modifiedAt;
  }
}

// Widget family → the layout type it is built from. Rows take that type's
// colour, the same one the Layout Picker and Structure Explorer use.
const WIDGET_LAYOUT_TYPE: Record<WidgetType, LayoutTypeId> = {
  Retention: "content",
  "Plan Picker": "plan-picker",
  Promotions: "commerce",
  Banner: "hero",
  Media: "media",
  SEO: "footer",
  Legal: "structure",
  Other: "structure",
};

// Production format glyphs (list-item.component): HTML → "</>", JSON → "{…}".
function formatGlyph(format: WidgetFormat): string {
  return format === "HTML" ? "</>" : "{…}";
}

// Widgets list — the real production Widgets screen (259 widgets), now a flat
// table: Format filter (All / HTML / JSON), slug search, sortable columns.
// "+" starts a new widget from the Layout Picker and opens it in the editor
// with that layout as its first section, the same way a Page gets sections.
export function WidgetsView() {
  const allRows = useMemo(() => buildWidgetRows(), []);
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | WidgetFormat>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "modifiedAt", dir: "desc" });
  const onSort = (key: SortKey) => setSort((prev) => nextSort(prev, key));
  const [pickerOpen, setPickerOpen] = useState(false);
  // Rows expand independently to show the pages each widget is used on.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggleRow = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const searched = q ? allRows.filter((r) => r.slug.toLowerCase().includes(q)) : allRows;

  const formatCounts = useMemo(() => {
    const acc: Record<WidgetFormat, number> = { HTML: 0, JSON: 0 };
    for (const r of allRows) acc[r.format] += 1;
    return acc;
  }, [allRows]);

  const filtered = useMemo(() => {
    const base =
      formatFilter === "all" ? searched : searched.filter((r) => r.format === formatFilter);
    // Sort before paging so each page is a slice of the full order.
    return [...base].sort((a, b) =>
      compareSortValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.dir),
    );
  }, [searched, formatFilter, sort]);

  useEffect(() => setPage(0), [q, formatFilter, pageSize, sort]);

  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="ui-ws-browse">
      <header className="ui-ws-browse__head">
        <div className="ui-ws-browse__title">
          <h1 className="ui-ws-browse__h1">Widgets</h1>
          <IconButton
            icon="plus"
            aria-label="Create widget"
            className="ui-ws-browse__add"
            onClick={() => setPickerOpen(true)}
          />
        </div>
      </header>

      <div className="ui-ws-browse__toolbar">
        <SearchInput
          size="sm"
          value={query}
          onChange={setQuery}
          onClear={() => setQuery("")}
          placeholder="Search…"
        />
        <div className="ui-ws-browse__tools">
          <Button variant="secondary" size="sm">
            View Archived Widgets
          </Button>
        </div>
      </div>

      <div className="ui-ws-browse__filters">
        <FilterChip
          label={`All (${allRows.length})`}
          active={formatFilter === "all"}
          onClick={() => setFormatFilter("all")}
        />
        {(["HTML", "JSON"] as WidgetFormat[]).map((f) => (
          <FilterChip
            key={f}
            label={`${f} (${formatCounts[f]})`}
            active={formatFilter === f}
            onClick={() => setFormatFilter((cur) => (cur === f ? "all" : f))}
          />
        ))}
      </div>

      <div className="ui-ws-browse__table ui-ws-browse__table--widgets" role="table" aria-label="Widgets">
        <div className="ui-ws-browse__row ui-ws-browse__row--head" role="row">
          {SORT_HEADERS.map((h) => (
            <SortHeaderCell key={h.key} sortKey={h.key} label={h.label} sort={sort} onSort={onSort} />
          ))}
          <span role="columnheader" aria-label="Actions" />
        </div>

        {pageRows.length === 0 ? (
          <EmptyState
            title="No widgets match your search"
            description="Try a different slug or clear the search and format filter."
          />
        ) : (
          pageRows.map((r) => (
            <WidgetRowItem
              key={r.id}
              row={r}
              expanded={openIds.has(r.id)}
              onToggle={() => toggleRow(r.id)}
            />
          ))
        )}
      </div>

      <TableFooter
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <LayoutPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        contextLabel="a new widget"
        onSelect={(layoutId) => {
          setPickerOpen(false);
          const id = createWidgetFromLayout(layoutId);
          if (id) navigate(routes.editor("widget", id));
        }}
      />
    </div>
  );
}

function WidgetRowItem({
  row,
  expanded,
  onToggle,
}: {
  row: WidgetRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Same rule as Pages: a widget with variants opens its Variants list, otherwise the editor.
  const open = () =>
    navigate(row.variantCount > 0 ? routes.widgetVariants(row.id) : routes.editor("widget", row.id));
  // Same rule as Pages: only rows with subpages get a chevron; the others keep
  // the empty slot so slugs, format pills and status pills stay in one column.
  const hasSubpages = row.children.length > 0;
  // A layout widget takes its layout's own type; anything else falls back to
  // its slug family.
  const layoutDef = row.layoutId ? layoutDefForWidget(row.slug) : undefined;
  const layoutType = layoutDef ? layoutTypeOf(layoutDef) : WIDGET_LAYOUT_TYPE[row.type];
  const layoutName = LAYOUT_TYPES[layoutType].name;
  return (
    <Fragment>
      <div
        className="ui-ws-browse__row ui-ws-browse__row--widgets ui-ws-browse__row--categorized"
        data-layout-type={layoutType}
        role="row"
      >
        <span className="ui-ws-browse__slug ui-ws-browse__primary" role="cell">
          {hasSubpages ? (
            <IconButton
              icon={expanded ? "chevron-down" : "chevron-right"}
              aria-label={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
              size="sm"
              onClick={onToggle}
            />
          ) : (
            <span className="ui-ws-browse__chevron-spacer" aria-hidden="true" />
          )}
          <span className="ui-ws-browse__markers">
            <span
              className="layout-chip"
              data-layout-type={layoutType}
              title={layoutName}
              aria-label={layoutName}
            >
              <MSym name={LAYOUT_TYPES[layoutType].icon} size={14} />
            </span>
            <span className="ui-ws-browse__format" title={row.format} aria-label={row.format}>
              {formatGlyph(row.format)}
            </span>
          </span>
          <Badge variant={row.status === "Published" ? "success" : "default"}>{row.status}</Badge>
          <button type="button" className="ui-ws-browse__slug-link" onClick={open}>
            {row.slug}
            {row.variantCount > 0 && (
              <span className="ui-ws-browse__slug-count">{row.variantCount} variants</span>
            )}
          </button>
        </span>
        <span role="cell" className="ui-ws-browse__name">{row.widgetName}</span>
        <span role="cell" className="ui-ws-browse__muted">{row.created}</span>
        <span role="cell" className="ui-ws-browse__muted">{row.modified}</span>
        <span role="cell" className="ui-ws-browse__actions">
          <IconButton icon="eye" aria-label="Preview" size="sm" />
          <IconButton icon="copy" aria-label="Duplicate" size="sm" />
          <IconButton icon="archive" aria-label="Archive" size="sm" />
          <IconButton icon="trash" aria-label="Delete" size="sm" variant="tertiary" />
        </span>
      </div>
      {expanded && (
        <div className="ui-ws-browse__widget-children" role="rowgroup">
          <div className="ui-ws-browse__widget-children-label">Pages :</div>
          {row.children.length === 0 ? (
            <div className="ui-ws-browse__widget-child" role="row">
              <span className="ui-ws-browse__muted">Subpages not captured in this preview yet.</span>
            </div>
          ) : (
            row.children.map((c) => <WidgetChildItem key={c.id} child={c} />)
          )}
        </div>
      )}
    </Fragment>
  );
}

// Subpage = a page that uses this widget. Read-only here: the page itself is
// authored in the Pages editor, not from the Widgets list.
function WidgetChildItem({ child }: { child: WidgetChildRow }) {
  return (
    <div className="ui-ws-browse__widget-child" role="row">
      <Badge variant={child.status === "Published" ? "success" : "default"}>{child.status}</Badge>
      <span className="ui-ws-browse__slug-link">{child.name}</span>
    </div>
  );
}
