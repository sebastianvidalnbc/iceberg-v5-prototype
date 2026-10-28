import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AuthoringContext, SectionRole, StructureObjectType, VariantWorkspace } from "../data";
import type { PreviewModel } from "../previewModel";
import { SelectField } from "../ui/form-controls";
import { MSym } from "../ui/msym";
import { Badge } from "../ui-lib/Badge";
import {
  CMS_SOURCE,
  PREVIEW_SOURCE,
  PREVIEW_STORAGE_KEY,
  type CmsToPreview,
  type PreviewToCms,
} from "../renderer/protocol";

// The selected Structure object, as resolved by WorkspaceShell. role is set only
// for Sections (its page role, e.g. "Plan Picker").
export interface SelectedObject {
  label: string;
  role: SectionRole | null;
  objectType: StructureObjectType | null;
}

interface LivePreviewProps {
  // The active experience. When null (a route — not an experience — is
  // selected) the canvas shows an empty state.
  variant: VariantWorkspace | null;
  context: AuthoringContext;
  selectedObject?: SelectedObject | null;
  // The live, renderable projection of the selection + the instance's edits.
  previewModel: PreviewModel;
  // The selected Structure node id (for highlight + Pick Section round-trip).
  selectedId: string | null;
  // Select a node when the author clicks it in the preview (Pick Section).
  onPickSection: (nodeId: string) => void;
  // MVT / A-B variations the author can preview (the mvtOverride analog).
  variations: { id: string; label: string; section?: string }[];
  mvtOverride: string;
  onMvtChange: (id: string) => void;
}

// Audience options grounded in the real Iceberg Content Page form.
const AUDIENCE_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "Entertainment", value: "entertainment" },
  { label: "Sky Cinema", value: "sky-cinema" },
  { label: "Kids", value: "kids" },
  { label: "Sky Sports", value: "sky-sports" },
];

// Device presets mirror the real editor's device-selector (Default / Laptop /
// Tablet / Mobile). Each maps to a TRUE viewport width the iframe renders at;
// the frame is then scaled to fit the preview column (see DESIGN_WIDTHS) so the
// customer render keeps its real published proportions instead of being squashed
// into the narrow column at 1:1 (which made everything look ~2× too big).
const SIZE_OPTIONS = [
  { label: "Full Size", value: "full" },
  { label: "Laptop", value: "laptop" },
  { label: "Tablet", value: "tablet" },
  { label: "Mobile", value: "mobile" },
];

// The viewport width (px) each preset renders the iframe document at. "Full" is
// the VERIFIED Commerce design frame (1440) — the exact width brand.css is built
// against (--pk-content-max 1440, 56px gutters, 384px plan cards), so the plan
// picker sits 3-across as designed. It is then scaled down to fit the column.
// Narrower devices only scale down when the column is smaller than the device
// (otherwise they show 1:1, centred).
const DESIGN_WIDTHS: Record<string, number> = {
  full: 1440,
  laptop: 1024,
  tablet: 834,
  mobile: 390,
};

// Sentinel for the MVT "As authored" option (Radix Select rejects "").
const AS_AUTHORED = "__as_authored__";

// Sentinel for the "no module chosen" state (Radix Select rejects "").
const NO_MODULE = "__no_module__";

// Data widgets (Retention Service) have no default visual render. The real
// editor lets an author pick a MODULE to render the widget's JSON through
// ("Preview JSON in Module"). These are the widget-driven modules available.
const PREVIEW_MODULE_OPTIONS = [
  { label: "Preview in module…", value: NO_MODULE },
  { label: "Retention Service", value: "retention-service" },
  { label: "In-App Offers", value: "in-app-offers" },
  { label: "Cancel Journey", value: "cancel-journey" },
];

// §1 Preview environment. Authors can validate config changes against the
// Stable-Int test stack BEFORE publishing to Production — so they no longer
// have to dump prod codes into stable-int to see the effect (§13).
const PREVIEW_ENV_OPTIONS = [
  { label: "Stable-Int (test)", value: "stable-int" },
  { label: "Production", value: "prod" },
];

// Collapse a node's authored fields (groups[].fields[] | fields[]) to a plain
// label→value map for the JSON projection.
type LooseNode = {
  id: string;
  label: string;
  objectType?: string | null;
  children?: LooseNode[];
  props?: { data?: { groups?: { fields?: { label: string; value: string }[] }[]; fields?: { label: string; value: string }[] } };
};
function nodeFields(node?: LooseNode): Record<string, string> {
  const data = node?.props?.data;
  if (!data) return {};
  const groups = data.groups ?? (data.fields ? [{ fields: data.fields }] : []);
  const out: Record<string, string> = {};
  for (const g of groups) for (const f of g.fields ?? []) out[f.label] = f.value;
  return out;
}

// Project the live widget Structure into the JSON the config would publish, so
// the module preview reflects edits / add-remove in real time.
function buildWidgetConfigJson(variant: VariantWorkspace | null): unknown {
  const roots = (variant?.structure ?? []) as unknown as LooseNode[];
  const find = (id: string) => roots.find((n) => n.id === id);
  const settings = nodeFields(find("wg-widget-settings"));
  const offersNode = find("wg-offers");
  const surveyNode = find("wg-survey-responses");
  const segNode = find("wg-segmentation");

  // Offers are grouped into category bands ("Retention Offers" / "Acquisition
  // Offers"); flatten to a list, tagging each offer with its band category. The
  // offer's own Type field is preserved via nodeFields(o).
  const offers = (offersNode?.children ?? []).flatMap((band) => {
    const category = band.label.replace(/ Offers$/, "");
    return (band.children ?? []).map((o) => ({ category, ...nodeFields(o) }));
  });
  const surveyResponses = (surveyNode?.children ?? []).map((s) => nodeFields(s));
  const serializeSeg = (n: LooseNode): unknown =>
    n.children && n.children.length
      ? { name: n.label, children: n.children.map(serializeSeg) }
      : { name: n.label, ...nodeFields(n) };

  return {
    name: settings.Name ?? variant?.name,
    format: settings.Format ?? "JSON",
    widgetType: settings["Widget Type"] ?? "Retention Service",
    journeyFlows: nodeFields(find("wg-journey-flows")),
    offers,
    segmentation: (segNode?.children ?? []).map(serializeSeg),
    surveyResponses,
  };
}

// The standalone renderer document the iframe loads. BASE_URL follows the
// configured Vite base in both development and production.
const RENDERER_URL = `${import.meta.env.BASE_URL}renderer.html`;

// §item7 Depth-first find of a Structure node by id (offers live two levels deep,
// under a category band). Returns the loose projection used by nodeFields.
function findLooseById(nodes: LooseNode[], id: string): LooseNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children && findLooseById(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

// §item7 Anna: "preview functionality for saved offers." A selected offer renders
// as a representative customer-facing offer card in the preview (Peacock) zone —
// styling is illustrative and deliberately distinct from the Eos editor chrome.
function WidgetOfferPreview({ fields }: { fields: Record<string, string> }) {
  const today = new Date().toISOString().slice(0, 10);
  const type = fields["Type"] || "Retention";
  const category =
    fields["Category Title"] || fields["Band"]?.replace(/ offer$/, "") || "";
  const staticId = fields["Cancellation Product Static ID"] || "";
  const prettyPlan = staticId
    ? staticId
        .replace(/^peacock_/, "Peacock ")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "your plan";
  const mode = fields["Product / Voucher"] || "None";
  const voucher = fields["Voucher Code"] || "";
  const product = fields["Product Static ID"] || "";
  const segment = fields["Segment Name (Optional)"] || "";
  const endDate = fields["Offer End Date"] || "";
  const isExpired = endDate !== "" && endDate < today;
  const liveInFlow = fields["Live in flow"] || "";
  const isLive = liveInFlow !== "" && liveInFlow !== "Not live";
  return (
    <div className="ui-offer-preview" role="group" aria-label="Saved offer preview">
      <div className="ui-offer-preview__badges">
        {isLive && <Badge variant="success">Live</Badge>}
        {isExpired && <Badge variant="danger">Expired</Badge>}
      </div>
      <p className="ui-offer-preview__eyebrow">
        {type} offer{category ? ` · ${category}` : ""}
      </p>
      <h3 className="ui-offer-preview__title">Keep {prettyPlan}</h3>
      <p className="ui-offer-preview__lede">
        {mode === "Voucher"
          ? "Apply this voucher to stay subscribed:"
          : mode === "Product"
            ? "Switch to this plan to keep watching:"
            : "The widget's default offer for this segment."}
      </p>
      {mode === "Voucher" && voucher && (
        <p className="ui-offer-preview__code">{voucher}</p>
      )}
      {mode === "Product" && product && (
        <p className="ui-offer-preview__plan">{product}</p>
      )}
      <dl className="ui-offer-preview__meta">
        <div>
          <dt>Segment</dt>
          <dd>{segment || "All cancelling customers"}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{endDate || "No end date"}</dd>
        </div>
        <div>
          <dt>Applies to</dt>
          <dd>{prettyPlan}</dd>
        </div>
      </dl>
      <p className="ui-offer-preview__note">
        Representative render of the saved offer — customer styling is illustrative.
      </p>
    </div>
  );
}

// Live accessibility score — the real editor's "semáforo": a colour-coded
// readout of the page's a11y rate for the current locale. Tri-state by ratio
// (green pass / amber review / red fail). The prototype has no a11y engine, so
// the score is representative; the component is fully driven by props so a real
// audit result can flow straight in.
function AccessibilityScore({
  score = 100,
  max = 100,
  region = "USA",
  locale = "en-US",
}: {
  score?: number;
  max?: number;
  region?: string;
  locale?: string;
}) {
  const pct = max > 0 ? score / max : 0;
  const state = pct >= 1 ? "pass" : pct >= 0.9 ? "warn" : "fail";
  const statusLabel = state === "pass" ? "Pass" : state === "warn" ? "Review" : "Fail";
  const localeLabel = `${region}-${locale.toUpperCase()}`;
  return (
    <div
      className="ui-a11y"
      data-state={state}
      role="status"
      aria-label={`Accessibility ${statusLabel}: ${score} of ${max}. Locale ${region} ${locale}.`}
      title={`Accessibility ${statusLabel} — ${score}/${max} · ${localeLabel}`}
    >
      <span className="ui-a11y__status">{statusLabel}</span>
      <span className="ui-a11y__score">
        {score}/{max}
      </span>
      <span className="ui-a11y__locale">{localeLabel}</span>
    </div>
  );
}

// Live preview status — two states. LIVE = green (content authored, postMessage
// patches flowing); DISABLED = nothing selected to render. (The old interim
// LOADING state was dropped: the preview now pushes unconditionally and renders
// instantly, so there is no handshake wait to surface.)
type LiveStatus = "live" | "disabled";

// Central workspace hosting the Peacock preview in a SEPARATE iframe document
// (renderer.html), synchronised over postMessage — the V4 analog of the real
// editor↔renderer bridge. Field edits patch the frame live; selecting a node
// highlights it in the frame; Pick Section lets a click in the frame select the
// matching Structure node. Device + audience controls reframe the canvas.
export function LivePreview({
  variant,
  context,
  selectedObject,
  previewModel,
  selectedId,
  onPickSection,
  variations,
  mvtOverride,
  onMvtChange,
}: LivePreviewProps) {
  const isWidget = context === "widget";
  // A layout widget is a page section, so it renders through the same Peacock
  // preview as a page. Data widgets (Retention, offers) keep the JSON preview.
  const rendersAsPage =
    isWidget && (variant?.structure ?? []).some((n) => n.objectType === "page-section");
  const [audience, setAudience] = useState("default");
  const [size, setSize] = useState("full");
  // Widget context: the module chosen to render this widget's JSON through.
  const [previewModule, setPreviewModule] = useState(NO_MODULE);
  // Widget context: which environment the preview reflects (§1).
  const [previewEnv, setPreviewEnv] = useState("stable-int");
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Measure the available canvas so we can scale a real desktop-width iframe to
  // fit it (device-preview zoom). ResizeObserver keeps it correct as the author
  // drags the Explorer/Properties dividers.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () =>
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the desktop-width iframe into the column. scale ≤ 1 (never upscale). The
  // sizer takes the SCALED (visual) box so flex centring works; the frame keeps
  // its true design dimensions and is transform-scaled inside it.
  const designW = DESIGN_WIDTHS[size] ?? 1280;
  const fitScale =
    canvasSize.w > 0 ? Math.min(1, canvasSize.w / designW) : 1;
  const sizerW = Math.round(designW * fitScale);
  const frameH = fitScale > 0 ? Math.round(canvasSize.h / fitScale) : canvasSize.h;

  const audienceLabel =
    AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? "Default";
  const hasContent = variant != null && previewModel.sections.length > 0;

  // MVT/A-B dropdown options: "As authored" + one per variation in the experience.
  // Radix Select forbids an empty-string item value, so "As authored" carries a
  // sentinel that maps back to "" (the mvtOverride default) at the boundary.
  const mvtOptions = [
    { label: "As authored", value: AS_AUTHORED },
    ...variations.map((v) => ({
      label: v.section ? `${v.section} · ${v.label}` : v.label,
      value: v.id,
    })),
  ];

  // Two states only: DISABLED (nothing authored) or LIVE (content present). The
  // preview now pushes unconditionally and renders instantly, so the old
  // ready-gated "loading" interstitial was misleading and has been removed.
  const status: LiveStatus = !hasContent ? "disabled" : "live";

  // Push the current model + framing state into the iframe (the live patch).
  const postRender = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const msg: CmsToPreview = {
      source: CMS_SOURCE,
      type: "render",
      model: previewModel,
      audience,
      selectedId,
      // Click-to-select is always on; the removed "Highlight elements" toggle
      // used to drive an outline-all mode — no longer surfaced.
      pickMode: false,
    };
    win.postMessage(msg, "*");
    // Mirror the model so a standalone "Preview In Tab" window can render it.
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewModel));
    } catch {
      /* ignore */
    }
  }, [previewModel, audience, selectedId]);

  // Keep mutable refs to the latest push fn, ready flag, and pick handler so the
  // message listener (and the hardening interval) can be attached ONCE with
  // []-deps and never miss a handshake. Previously the listener depended on
  // `postRender`, whose identity changes on every field edit, so it was torn
  // down and re-attached constantly — and the iframe's one-shot "ready" ping
  // could land during a re-subscription gap. When that happened `setReady`
  // never fired: the badge stayed LOADING and, once the hardening window below
  // elapsed, the ready-gated re-push froze all live edits. Refs remove the race.
  const postRenderRef = useRef(postRender);
  const readyRef = useRef(ready);
  const onPickSectionRef = useRef(onPickSection);
  useLayoutEffect(() => {
    postRenderRef.current = postRender;
    readyRef.current = ready;
    onPickSectionRef.current = onPickSection;
  });

  // Listen for messages from the iframe: ready (mark live + push the model) and
  // Pick Section clicks (select the node). Attached once — it reads the latest
  // handlers through the refs above, so it never re-subscribes.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as PreviewToCms;
      if (!data || data.source !== PREVIEW_SOURCE) return;
      if (data.type === "ready") {
        setReady(true);
        postRenderRef.current();
      } else if (data.type === "section-selected") {
        // Click-to-select is always on; picking no longer exits the (optional)
        // highlight mode, so the author can keep clicking element to element.
        onPickSectionRef.current(data.nodeId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Push on EVERY model / selection / framing change, independent of the "ready"
  // handshake. The renderer applies any "render" it receives regardless of the
  // one-shot ping, and postRender no-ops when the frame isn't mounted yet — so
  // pushing unconditionally guarantees keystroke edits always reach the preview
  // even if the handshake was missed. Fired from a LAYOUT effect (not a passive
  // effect) so the postMessage is flushed in the SAME commit as the edit, before
  // the browser paints — the preview tracks keystrokes with no perceptible lag
  // (this is a prototype: the edit→preview path must feel instant).
  useLayoutEffect(() => {
    postRender();
  }, [postRender]);

  // Bridge hardening (parent side). The iframe applies any "render" it receives
  // regardless of the one-shot "ready" handshake, so after each (re)load we
  // proactively re-push the current render on a short interval until the
  // handshake is acknowledged — capped so it can't spin. This delivers the
  // model even when the "ready" ping is lost: a cross-document mount race, or a
  // long-lived iframe that desynced during a dev/HMR session. Paired with the
  // renderer-side re-announce, both ends of the bridge now self-heal.
  const [loadTick, setLoadTick] = useState(0);
  useEffect(() => {
    if (loadTick === 0) return;
    let n = 0;
    const id = window.setInterval(() => {
      postRenderRef.current();
      if (readyRef.current || ++n > 15) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [loadTick]);

  // Widget context: data widgets (Retention Service) have no page render. Show
  // the real "Preview JSON in Module" picker — pick a module to render the
  // widget's live JSON through; otherwise an honest empty state.
  if (isWidget && !rendersAsPage) {
    const moduleLabel =
      PREVIEW_MODULE_OPTIONS.find((o) => o.value === previewModule)?.label ?? "";
    const envLabel =
      PREVIEW_ENV_OPTIONS.find((o) => o.value === previewEnv)?.label ?? "";
    const isTestEnv = previewEnv !== "prod";
    const showModule = previewModule !== NO_MODULE;
    // §item7 A selected saved offer renders as a real offer preview, ahead of the
    // module/empty state (offers sit two levels deep under a category band).
    const offerNode =
      selectedObject?.objectType === "offer" && selectedId
        ? findLooseById(
            (variant?.structure ?? []) as unknown as LooseNode[],
            selectedId,
          )
        : undefined;
    const offerFields = offerNode ? nodeFields(offerNode) : null;
    const configJson = showModule
      ? JSON.stringify(buildWidgetConfigJson(variant), null, 2)
      : "";
    return (
      <section className="ui-ws__region ui-ws-preview" aria-label="Widget preview">
        <div className="ui-ws-preview__inner">
          <div className="ui-preview">
            <div className="ui-preview__toolbar">
              <div className="ui-preview__toolbar-row">
                <div className="ui-preview__controls">
                  <div className="ui-preview__field">
                    <SelectField
                      aria-label="Preview in module"
                      value={previewModule}
                      onValueChange={setPreviewModule}
                      options={PREVIEW_MODULE_OPTIONS}
                    />
                  </div>
                  {/* §1 Environment switcher — preview against the Stable-Int
                      test stack before publishing to Production. */}
                  <div className="ui-preview__field">
                    <SelectField
                      aria-label="Preview environment"
                      value={previewEnv}
                      onValueChange={setPreviewEnv}
                      options={PREVIEW_ENV_OPTIONS}
                    />
                  </div>
                </div>
                <div className="ui-preview__meta">
                  {/* The widget's JSON format is already declared in the editor
                      header (and the "live config JSON" caption below), so the
                      preview toolbar shows only what's unique here: the target
                      environment and the render status. */}
                  {/* Environment pill — makes the target stack explicit so test
                      previews are never mistaken for production. */}
                  <Badge variant={isTestEnv ? "warning" : "info"}>{envLabel}</Badge>
                  {/* Status pill — kept consistent with the Page preview's
                      tri-state. A picked module renders the live config JSON
                      (LIVE); with none chosen there is nothing to render
                      (DISABLED). */}
                  <span className="ui-preview__status">
                    {offerFields || showModule ? (
                      <Badge variant="success">LIVE</Badge>
                    ) : (
                      <Badge variant="default">DISABLED</Badge>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="ui-preview__canvas"
              data-mode={offerFields ? "offer" : showModule ? "json" : undefined}
            >
              {offerFields ? (
                <WidgetOfferPreview fields={offerFields} />
              ) : showModule ? (
                <div className="ui-preview__json">
                  <div className="ui-preview__json-head">
                    Rendering with <strong>{moduleLabel}</strong> ·{" "}
                    <strong>{envLabel}</strong> · live config JSON
                    {isTestEnv && " — safe to preview unpublished changes"}
                  </div>
                  <pre className="ui-preview__json-body">{configJson}</pre>
                </div>
              ) : (
                <div className="ui-preview__empty">
                  <MSym name="desktop_windows" size={40} className="ui-preview__empty-icon" />
                  <p className="ui-preview__empty-title">No preview module selected</p>
                  <p className="ui-preview__empty-sub">
                    Select a saved offer in the Structure to preview it, or pick a
                    module above to render this widget’s JSON.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ui-ws__region ui-ws-preview" aria-label="Live preview">
      <div className="ui-ws-preview__inner">
        <div className="ui-preview">
          <div className="ui-preview__toolbar">
            <div className="ui-preview__toolbar-row">
              <div className="ui-preview__controls">
                {variations.length > 0 && (
                  <div className="ui-preview__field">
                    <SelectField
                      aria-label="Variation (MVT)"
                      value={mvtOverride || AS_AUTHORED}
                      onValueChange={(val) =>
                        onMvtChange(val === AS_AUTHORED ? "" : val)
                      }
                      options={mvtOptions}
                    />
                  </div>
                )}
                <div className="ui-preview__field">
                  <SelectField
                    aria-label="Audience"
                    value={audience}
                    onValueChange={setAudience}
                    options={AUDIENCE_OPTIONS}
                  />
                </div>
                <div className="ui-preview__field">
                  <SelectField
                    aria-label="Preview size"
                    value={size}
                    onValueChange={setSize}
                    options={SIZE_OPTIONS}
                  />
                </div>
              </div>
              <div className="ui-preview__meta">
                {hasContent && (
                  <AccessibilityScore score={100} max={100} region="USA" locale="en-US" />
                )}
                <span className="ui-preview__status">
                  {status === "live" && <Badge variant="success">LIVE</Badge>}
                  {status === "disabled" && <Badge variant="default">DISABLED</Badge>}
                </span>
              </div>
            </div>
          </div>
          <div
            ref={canvasRef}
            className="ui-preview__canvas"
            data-mode={hasContent ? "frame" : undefined}
          >
            {hasContent ? (
              <div
                className="ui-preview__sizer"
                style={{ width: sizerW || undefined, height: canvasSize.h || undefined }}
              >
                <div
                  className="ui-preview__frame"
                  style={{
                    width: designW,
                    height: frameH || undefined,
                    transform: `scale(${fitScale})`,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    className="ui-preview__iframe"
                    title="Live preview"
                    src={RENDERER_URL}
                    onLoad={() => {
                      setReady(false);
                      setLoadTick((t) => t + 1);
                    }}
                  />
                </div>
                {audience !== "default" && (
                  <p className="ui-preview__audience-overlay">
                    <Badge variant="info">{audienceLabel} audience</Badge>
                  </p>
                )}
              </div>
            ) : (
              <span className="ui-preview__label">
                Select a {isWidget ? "widget config" : "variant"}, then an object
                in its structure to preview it.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
