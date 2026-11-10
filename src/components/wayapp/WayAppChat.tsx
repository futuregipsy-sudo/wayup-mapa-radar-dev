import { ArrowRight, Maximize2, Minimize2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import logo from "@/assets/wayapp-logo.png";
import { WayAppMap } from "./WayAppMap";
import { BrandingStudio } from "./BrandingStudio";

type Msg = { role: "user" | "assistant"; text: string };

function asksAboutPricing(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Recognize pricing intent even when visitors do not say "precio" or "tarifa".
  // Examples: "¿Cuánto me costaría una web?", "¿Qué cobráis por SEO?",
  // "¿En cuánto sale una tienda online?", "¿Tenéis planes mensuales?"
  return /\b(precios?|tarifas?|cost[eo]s?|costar(?:ia|an|a|me)?|cuest[ao]|cuestan|cobr(?:ais|an|ar|aria|an)?|presupuestos?|cotizaci(?:on|ones)|importes?|euros?|€|planes?|mensualidades|cuotas?|barat[oa]s?|car[oa]s?)\b/.test(normalized)
    || /\bcuanto(?:s|as)?\b.{0,65}\b(cost|cuest|val|cobr|sal|pag|seria|sale|haria)\w*/.test(normalized)
    || /\b(?:en cuanto|por cuanto|que vale|que cuesta|que precio|que tarifa|que presupuesto|cuanto hay que pagar)\b/.test(normalized);
}

/** Render the bold syntax used by the assistant as actual emphasis, not literal asterisks.
 * React escapes text nodes, so model output cannot inject HTML.
 */
function renderAssistantText(text: string) {
  // Normalize common model Markdown into clean text; never interpret arbitrary HTML.
  const clean = text
    .replace(/^#{1,6}\\s+/gm, "")
    .replace(/^\\s*[-*]\\s+/gm, "• ")
    .replace(/^\\s*\\|?\\s*:?-{3,}:?\\s*(?:\\|\\s*:?-{3,}:?\\s*)+\\|?\\s*$/gm, "")
    .replace(/^\\|(.+)\\|\\s*$/gm, (_line, cells: string) => cells.split("|").map(cell => cell.trim()).filter(Boolean).join(" · "))
    .replace(/\\n{3,}/g, "\\n\\n");
  const tokens = clean.split(/(\\[Servicios y Tarifas\\]\\(\\/servicios-y-tarifas\\)|\\*\\*[^*\\n]+\\*\\*|(?<!\\*)\\*[^*\\n]+\\*(?!\\*))/gi);
  return tokens.map((token, index) => {
    if (/^\\[Servicios y Tarifas\\]\\(\\/servicios-y-tarifas\\)$/i.test(token))
      return <a key={index} href="/servicios-y-tarifas" className="wa-inline-link">Servicios y Tarifas</a>;
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2)
      return <em key={index}>{token.slice(1, -1)}</em>;
    return token;
  });
}

type StreamEvent = { type: string; content?: string; message?: string };

const STARTERS = [
  "Quiero mejorar la presencia digital de mi negocio",
  "¿Qué puede hacer WAY UP por mi empresa?",
  "Necesito una página web profesional",
  "Quiero conseguir más clientes",
];

export function WayAppLogo() {
  return <img className="wa-logo" src={logo} alt="" draggable={false} />;
}

export function WayAppWordmark() {
  return (
    <span className="wa-wordmark">
      WAY<span>.</span>APP
    </span>
  );
}

type ChatProps = {
  onClose?: (() => void) | undefined;
  onExpand?: (() => void) | undefined;
  expanded?: boolean | undefined;
};

export function WayAppChat({ onClose, onExpand, expanded = false }: ChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAuditOffer, setShowAuditOffer] = useState(false);
  const [toolPanel, setToolPanel] = useState<"map" | "radar" | "branding" | null>(null);
  const [auditWebsite, setAuditWebsite] = useState("");
  const [pendingRadarPrompt, setPendingRadarPrompt] = useState<string | null>(null);
  const [showPricingLink, setShowPricingLink] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onRadarAnalyze = (event: Event) => {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (typeof prompt === "string" && prompt.length <= 2000) {
        setToolPanel(null);
        setPendingRadarPrompt(prompt);
      }
    };
    const onOpenAudit = (event: Event) => {
      const website = (event as CustomEvent<{ website?: string }>).detail?.website;
      if (typeof website === "string" && /^https?:\/\//i.test(website)) {
        setAuditWebsite(website);
        setToolPanel("radar");
      }
    };
    window.addEventListener("wayapp:open-seo-audit", onOpenAudit);
    window.addEventListener("wayapp:radar-analyze", onRadarAnalyze);
    return () => {
      window.removeEventListener("wayapp:radar-analyze", onRadarAnalyze);
      window.removeEventListener("wayapp:open-seo-audit", onOpenAudit);
    };
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setShowAuditOffer(false);
    setShowPricingLink(asksAboutPricing(text));

    const history = [
      ...messages.slice(-15).map(({ role, text: content }) => ({ role, content })),
      { role: "user" as const, content: text },
    ];
    setMessages((m) => [...m, { role: "user", text }]);
    setValue("");
    setBusy(true);

    let assistantText = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ messages: history, conversationId }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorBody.error === "string" ? errorBody.error : "No se ha podido conectar con WAY.APP.",
        );
      }
      const savedId = response.headers.get("X-WayApp-Conversation-Id");
      if (savedId) setConversationId(savedId);
      if (!response.body) throw new Error("El servidor no ha devuelto una respuesta en streaming.");

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const event = JSON.parse(trimmed) as StreamEvent;
        if (event.type === "delta" && typeof event.content === "string") {
          assistantText += event.content;
          const snapshot = assistantText;
          setMessages((current) => {
            const last = current[current.length - 1];
            if (last?.role === "assistant") return [...current.slice(0, -1), { ...last, text: snapshot }];
            return [...current, { role: "assistant", text: snapshot }];
          });
        }
        if (event.type === "audit_offer") setShowAuditOffer(true);
        if (event.type === "error") throw new Error(event.message || "La respuesta se ha interrumpido.");
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processLine(buffer);
      if (!assistantText.trim()) throw new Error("WAY.APP no ha recibido una respuesta. Inténtalo de nuevo.");
      if (asksAboutPricing(text) || /\[Servicios y Tarifas\]\(\/servicios-y-tarifas\)/i.test(assistantText)) {
        setShowPricingLink(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ha ocurrido un error inesperado.";
      setMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingRadarPrompt || busy) return;
    const prompt = pendingRadarPrompt;
    setPendingRadarPrompt(null);
    void send(prompt);
  }, [pendingRadarPrompt, busy]);

  return (
    <div className="wa-shell">
      <header className="wa-header">
        <div className="wa-brand">
          <WayAppLogo />
          <WayAppWordmark />
        </div>
        <div className="wa-controls">
          {messages.length > 0 && (
            <button
              type="button"
              className="wa-icon-btn"
              title="Nueva conversación"
              aria-label="Nueva conversación"
              onClick={() => {
                setMessages([]);
                setConversationId(null);
                setShowAuditOffer(false);
                setShowPricingLink(false);
              }}
            >
              <RotateCcw size={16} />
            </button>
          )}
          {onExpand && (
            <button
              type="button"
              className="wa-icon-btn wa-desktop-only"
              onClick={onExpand}
              title={expanded ? "Reducir" : "Ampliar"}
              aria-label={expanded ? "Reducir" : "Ampliar"}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
          {onClose && (
            <button type="button" className="wa-icon-btn" onClick={onClose} title="Cerrar" aria-label="Cerrar">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="wa-transcript" ref={transcriptRef}>
        {messages.length === 0 ? (
          <div className="wa-welcome">
            <div className="wa-welcome-symbol">
              <Sparkles size={20} />
            </div>
            <p className="wa-eyebrow">TU ASISTENTE DIGITAL</p>
            <h2>
              Hola. Soy <em>WAY.APP.</em>
            </h2>
            <p>
              Estoy aquí para conocer tu negocio, resolver tus dudas y ayudarte a descubrir cómo puedes
              crecer en el mundo digital.
            </p>
            <div className="wa-starters">
              {STARTERS.map((s) => (
                <button type="button" key={s} onClick={() => void send(s)}>
                  {s}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="wa-messages">
            {messages.map((m, i) => (
              <div className={`wa-message wa-${m.role}`} key={i}>
                {m.role === "assistant" && (
                  <div className="wa-assistant-label">
                    <WayAppLogo />
                    <span>WAY.APP</span>
                  </div>
                )}
                <div className="wa-bubble">{m.role === "assistant" ? renderAssistantText(m.text) : m.text}</div>
              </div>
            ))}
            {showPricingLink && !busy && !showAuditOffer && (
              <a className="wa-pricing-link" href="/servicios-y-tarifas">
                Ver servicios y tarifas <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
            {showAuditOffer && (
              <aside
                className="wa-audit-offer"
                aria-label="Información y auditoría gratuita"
                style={{
                  position: "relative",
                  isolation: "isolate",
                  overflow: "hidden",
                  borderRadius: 18,
                  padding: "18px 18px",
                  marginTop: 16,
                  background: "linear-gradient(145deg, #284bf3 0%, #2144ed 65%, #1b3de2 100%)",
                  color: "#fff",
                  boxShadow: "0 12px 30px rgba(26, 62, 203, .16)",
                }}
              >
                <img
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    width: 190,
                    height: 190,
                    objectFit: "contain",
                    top: -50,
                    right: -45,
                    opacity: 0.12,
                    transform: "rotate(-16deg)",
                    pointerEvents: "none",
                    zIndex: -1,
                  }}
                />
                <p style={{ letterSpacing: "0.19em", fontSize: 11, fontWeight: 700, marginBottom: 9, opacity: 0.85 }}>
                  AUDITORÍA GRATUITA
                </p>
                <strong style={{ display: "block", fontSize: "clamp(19px, 4vw, 24px)", lineHeight: 1.22, marginBottom: 8 }}>
                  ¿Quieres llevar tu negocio al siguiente nivel?
                </strong>
                <p style={{ lineHeight: 1.45, marginBottom: 14, color: "rgba(255,255,255,.9)" }}>
                  Descubre cómo WAY UP puede ayudarte. Solicita una auditoría gratuita o habla con nuestro equipo.
                </p>
                {showPricingLink && !busy && (
                  <a
                    href="/servicios-y-tarifas"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      textAlign: "center",
                      padding: "11px 14px",
                      borderRadius: 999,
                      background: "#fffdf8",
                      color: "#16245a",
                      fontWeight: 700,
                      textDecoration: "none",
                      marginBottom: 8,
                    }}
                  >
                    Ver servicios y tarifas <ArrowRight size={16} aria-hidden="true" />
                  </a>
                )}
                <a
                  href="/#contacto"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "11px 14px",
                    borderRadius: 999,
                    background: "#fffdf8",
                    color: "#16245a",
                    fontWeight: 700,
                    textDecoration: "none",
                    marginBottom: 8,
                  }}
                >
                  Solicitar auditoría gratuita ↗
                </a>
                <a
                  href="mailto:hola@wayup.es"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "10px 14px",
                    border: "1px solid rgba(255,255,255,.5)",
                    borderRadius: 999,
                    color: "#fff",
                    fontWeight: 600,
                    textDecoration: "none",
                    marginBottom: 11,
                  }}
                >
                  Hablar con WAY UP
                </a>
                <a
                  href="https://www.wayupagency.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "rgba(255,255,255,.9)", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Visitar la web de WAY UP
                </a>
              </aside>
            )}
            {busy && (
              <div className="wa-thinking">
                <WayAppLogo />
                <span>WAY.APP está pensando…</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid #e9e5e0" }}>
        <button type="button" onClick={() => setToolPanel("radar")} style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 12, border: "1px solid #dfe4ff", background: "#f7f8ff", color: "#18285c", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>⌕ Radar SEO</button>
        <button type="button" onClick={() => setToolPanel("branding")} style={{ flex: 1.2, minWidth: 0, padding: "8px 5px", borderRadius: 12, border: "1px solid #ccd5ff", background: "#eef1ff", color: "#18285c", fontSize: 11, fontWeight: 750, cursor: "pointer" }}>✦ Diseña tu marca</button>
        <button type="button" onClick={() => setToolPanel("map")} style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 12, border: "1px solid #e7e2d9", background: "#fff", color: "#18285c", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>⌖ Buscar negocio</button>
      </div>
      {toolPanel && typeof document !== "undefined" && createPortal(
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 2147483000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(13, 19, 42, .66)" }}>
          <section role="dialog" aria-modal="true" aria-labelledby="wayapp-tool-title" style={{ width: "min(100%, 560px)", maxHeight: "min(85dvh, 760px)", display: "flex", flexDirection: "column", background: "#fff", color: "#172653", borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,.3)", overflow: "hidden" }}>
            <header style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e9e5e0" }}>
              <div><strong id="wayapp-tool-title" style={{ fontSize: 17 }}>{toolPanel === "radar" ? "Smart Radar SEO" : toolPanel === "branding" ? "Diseña tu marca" : "Buscar mi negocio"}</strong><small style={{ display: "block", color: "#737c90", marginTop: 3 }}>{toolPanel === "radar" ? "Auditoría técnica · Google PageSpeed" : toolPanel === "branding" ? "Branding Studio · Briefing creativo con IA" : "Búsqueda de empresas · Google Places"}</small></div>
              <button type="button" onClick={() => setToolPanel(null)} aria-label="Cerrar ventana y volver al chat" style={{ border: 0, background: "#f0f2f7", borderRadius: 10, padding: 8, cursor: "pointer", color: "#172653" }}><X size={19} /></button>
            </header>
            <div style={{ padding: "8px 20px 20px", overflowY: "auto", minHeight: 0 }}>{toolPanel === "branding" ? <BrandingStudio onBrief={(prompt) => { setToolPanel(null); setPendingRadarPrompt(prompt); }} /> : <WayAppMap mode={toolPanel} initialWebsite={auditWebsite} />}</div>
            <footer style={{ padding: "10px 20px", borderTop: "1px solid #e9e5e0", color: "#737c90", fontSize: 12 }}>WAY.APP · Tu conversación permanece abierta.</footer>
          </section>
        </div>, document.body
      )}
      <form
        className="wa-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(value);
        }}
      >
        <textarea
          value={value}
          maxLength={2000}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(value);
            }
          }}
          placeholder="Escribe tu pregunta…"
          aria-label="Escribe tu pregunta"
        />
        <div className="wa-composer-bottom">
          <span>Enter para enviar · Shift + Enter para nueva línea</span>
          <button type="submit" className="wa-send" disabled={!value.trim() || busy} aria-label="Enviar">
            <Send size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}
