import { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../ui-lib/Button";
import { Badge } from "../ui-lib/Badge";
import { SearchInput } from "../ui-lib/TextInput";
import { TableFooter } from "../ui-lib/TableFooter";
import { EmptyState } from "../ui-lib/EmptyState";
import { DateField } from "../ui-lib/DateField";
import { Switch } from "../ui/switch";
import { navigate, routes } from "../browse";
import { WIDGET_CONFIGS } from "../data";
import { allWidgets, productionWidgetId } from "../widget-create";
import { widgetVariantsFor, type WidgetVariant } from "../widget-variants";

// Edited publish and schedule state per variant. Module-level so an edit survives
// moving into the editor and back; a page reload resets the prototype.
type VariantEdit = Pick<WidgetVariant, "published" | "scheduledAt">;
const variantEdits = new Map<string, VariantEdit>();

// Variants list for a widget (production "Variants for /slug"). Columns follow
// production: name, QA, publish switch, scheduled date, created, modified, by.
// Row actions float over the row on hover, as on the Pages variants list.
export function WidgetVariantsView({ widgetId }: { widgetId: string }) {
  const slug = allWidgets().find((w) => productionWidgetId(w.slug) === widgetId)?.slug ?? `/${widgetId}`;
  const baseRows = useMemo(() => widgetVariantsFor(slug), [slug]);
  const [editVersion, setEditVersion] = useState(0);
  const allRows = useMemo(
    () => baseRows.map((v) => ({ ...v, ...(variantEdits.get(v.id) ?? {}) })),
    [baseRows, editVersion]
  );
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => allRows.filter((v) => !q || v.name.toLowerCase().includes(q)),
    [allRows, q]
  );
  useEffect(() => setPageIndex(0), [q, pageSize]);
  const pageRows = rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

  const updateVariant = (v: WidgetVariant, patch: Partial<VariantEdit>) => {
    variantEdits.set(v.id, { published: v.published, scheduledAt: v.scheduledAt, ...patch });
    setEditVersion((n) => n + 1);
  };

  return (
    <div className="ui-ws-browse">
      <header className="ui-ws-browse__head">
        <div className="ui-ws-browse__title">
          <h1 className="ui-ws-browse__h1">Variants for {slug}</h1>
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
            View Archived Variants
          </Button>
        </div>
      </div>

      <div
        className="ui-ws-browse__table ui-ws-browse__table--widget-variants"
        role="table"
        aria-label={`Variants for ${slug}`}
      >
        <div className="ui-ws-browse__row ui-ws-browse__row--head" role="row">
          <span role="columnheader" aria-label="Edit" />
          <span role="columnheader">Variant Name</span>
          <span role="columnheader">QA Status</span>
          <span role="columnheader">Publish</span>
          <span role="columnheader">Scheduled time</span>
          <span role="columnheader">Created date</span>
          <span role="columnheader">Last modified date</span>
          <span role="columnheader">Last modified by</span>
        </div>

        {pageRows.length === 0 ? (
          <EmptyState
            title="No variants match your search"
            description="Try a different name or clear the search."
          />
        ) : (
          pageRows.map((v) => (
            <WidgetVariantRow
              key={v.id}
              variant={v}
              onOpen={() =>
                navigate(routes.editor("widget", WIDGET_CONFIGS[v.id] ? v.id : widgetId))
              }
              onChange={(patch) => updateVariant(v, patch)}
            />
          ))
        )}
      </div>

      <TableFooter
        page={pageIndex}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPageIndex}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function qaBadge(qa: WidgetVariant["qaStatus"]) {
  if (qa === "Approved") return <Badge variant="success">Approved</Badge>;
  if (qa === "In review") return <Badge variant="warning">In review</Badge>;
  return <span className="ui-ws-browse__muted">—</span>;
}

function WidgetVariantRow({
  variant,
  onOpen,
  onChange,
}: {
  variant: WidgetVariant;
  onOpen: () => void;
  onChange: (patch: Partial<VariantEdit>) => void;
}) {
  return (
    <div className="ui-ws-browse__row" role="row">
      <span role="cell">
        <IconButton icon="edit" aria-label={`Edit ${variant.name}`} size="sm" onClick={onOpen} />
      </span>
      <span className="ui-ws-browse__primary" role="cell">
        <button type="button" className="ui-ws-browse__slug-link" onClick={onOpen}>
          {variant.name}
        </button>
      </span>
      <span role="cell">{qaBadge(variant.qaStatus)}</span>
      <span role="cell">
        <Switch
          size="sm"
          checked={variant.published}
          onCheckedChange={(published) => onChange({ published })}
          aria-label={`Publish ${variant.name}`}
        />
      </span>
      <span role="cell">
        <DateField
          label="Scheduled time"
          value={variant.scheduledAt}
          onChange={(scheduledAt) => onChange({ scheduledAt })}
          placeholder="not scheduled"
        />
      </span>
      <span role="cell" className="ui-ws-browse__muted">{variant.createdDate}</span>
      <span role="cell" className="ui-ws-browse__muted">{variant.modifiedDate}</span>
      <span role="cell" className="ui-ws-browse__muted">{variant.modifiedBy}</span>
      {/* Floating row actions: shown on hover over the row's right edge, not a column. */}
      <span className="ui-ws-browse__actions ui-ws-browse__actions--float">
        <IconButton icon="copy" aria-label="Duplicate" size="sm" />
        <IconButton icon="archive" aria-label="Archive" size="sm" />
        <IconButton icon="trash" aria-label="Delete" size="sm" variant="tertiary" />
      </span>
    </div>
  );
}
