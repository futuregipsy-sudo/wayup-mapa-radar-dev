import { useState } from "react";

type Place = { id?: string; name?: string; address?: string; lat?: number; lng?: number; website?: string; mapsUrl?: string; type?: string; rating?: number };
type Audit = { website: string; source: string; scores: Record<string, number | null>; issues: Array<{ title?: string; description?: string; score?: number }> };
function sendToAI(prompt: string) {
  window.dispatchEvent(new CustomEvent("wayapp:radar-analyze", { detail: { prompt: prompt.slice(0, 1950) } }));
}
export function WayAppMap({ mode = "map", initialWebsite = "" }: { mode?: "all" | "map" | "radar"; initialWebsite?: string }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [website, setWebsite] = useState(initialWebsite);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || query.trim().length < 3) return;
    setBusy(true); setError(""); setPlaces([]); setSelected(null); setAudit(null);
    try {
      const response = await fetch("/api/places-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }) });
      const data = await response.json() as { places?: Place[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo buscar.");
      setPlaces(data.places ?? []);
      if (!data.places?.length) setError("No se encontraron negocios. Prueba con nombre y ciudad.");
    } catch (e) { setError(e instanceof Error ? e.message : "Error de búsqueda."); }
    finally { setBusy(false); }
  }
  function normalizeWebsite(input: string): string {
    const value = input.trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : "https://" + value;
  }
  async function analyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setAudit(null);
    try {
      const response = await fetch("/api/seo-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: normalizeWebsite(website) }) });
      const data = await response.json() as Audit & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo auditar.");
      setAudit(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Error de auditoría."); }
    finally { setBusy(false); }
  }
  const inputStyle: React.CSSProperties = { width: "100%", minWidth: 0, padding: 10, border: "1px solid #d9dce8", borderRadius: 10, background: "white", color: "#111" };
  const buttonStyle: React.CSSProperties = { padding: "10px 12px", background: "#2445ed", color: "#fff", border: 0, borderRadius: 10, cursor: "pointer", marginTop: 8 };
  return <div style={{ width: "100%", minWidth: 0, padding: "12px 0", fontSize: 13 }}>
    {mode === "map" || mode === "all" ? <>
      <form onSubmit={search}>
        <label htmlFor="wayapp-business-search">Nombre del negocio y ciudad</label>
        <input id="wayapp-business-search" style={inputStyle} value={query} maxLength={120} onChange={e => setQuery(e.target.value)} placeholder="Ej.: cafetería en Salamanca" />
        <button type="submit" disabled={busy || query.trim().length < 3} style={buttonStyle}>{busy ? "Buscando..." : "Buscar con Google Maps"}</button>
      </form>
      <div aria-live="polite" style={{ marginTop: 8 }}>
        {places.map(p => <button key={p.id ?? p.name} type="button" onClick={() => { setSelected(p); setWebsite(p.website ?? ""); setAudit(null); }} style={{ display: "block", width: "100%", padding: 10, textAlign: "left", margin: "5px 0", background: selected?.id === p.id ? "#eef1ff" : "#fff", border: "1px solid #dce0ec", borderRadius: 10, cursor: "pointer" }}><strong>{p.name}</strong><small style={{ display: "block" }}>{p.address}</small></button>)}
      </div>
      {selected && <div style={{ padding: 10, background: "#f5f6fc", borderRadius: 10 }}>
        <strong>{selected.name}</strong><p>{selected.address}</p>
        {selected.mapsUrl && <a href={selected.mapsUrl} target="_blank" rel="noopener noreferrer">Abrir en Google Maps ↗</a>}
        {selected.website && <p><a href={selected.website} target="_blank" rel="noopener noreferrer">Visitar web ↗</a></p>}
        <button type="button" style={buttonStyle} onClick={() => sendToAI("Analiza las oportunidades de SEO local de este negocio según su ficha de Google Places. Nombre: " + selected.name + ". Dirección: " + selected.address + ". Categoría: " + selected.type + ". Web: " + (selected.website || "no disponible") + ". Valoración: " + (selected.rating ?? "no disponible") + ". No inventes una auditoría web ni métricas que no consten en estos datos.")}>Consultar oportunidades con WAY.APP</button>
        {selected.website && <button type="button" style={{ ...buttonStyle, marginLeft: 6, background: "#172653" }} onClick={() => window.dispatchEvent(new CustomEvent("wayapp:open-seo-audit", { detail: { website: selected.website } }))}>Preparar auditoría web</button>}
      </div>}
    </> : null}
    {(mode === "radar" || mode === "all") && <>
      <form onSubmit={analyze}>
        <label htmlFor="wayapp-seo-url"><strong>Smart Radar SEO · Auditoría de web</strong></label>
        <input id="wayapp-seo-url" type="text" inputMode="url" required maxLength={500} style={inputStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.tunegocio.es o https://tunegocio.es" />
        <button type="submit" disabled={busy || !website.trim()} style={buttonStyle}>{busy ? "Analizando..." : "Analizar con PageSpeed"}</button>
      </form>
      {audit && <div style={{ padding: 10, marginTop: 10, background: "#f5f6fc", borderRadius: 10 }}>
        <strong>Resultados reales · Lighthouse móvil</strong>
        {Object.entries(audit.scores).map(([name, score]) => <p key={name} style={{ margin: "4px 0" }}>{name}: <strong>{score ?? "Sin datos"}/100</strong></p>)}
        <p>{audit.issues.length} oportunidades técnicas detectadas.</p>
        <button type="button" style={buttonStyle} onClick={() => sendToAI("Realiza un diagnóstico SEO técnico preliminar de " + audit.website + " usando SOLO estos resultados reales de Google PageSpeed Insights móvil. Puntuaciones: " + JSON.stringify(audit.scores) + ". Incidencias: " + audit.issues.slice(0, 6).map(x => x.title).join("; ") + ". Prioriza tres mejoras, explica límites de Lighthouse y sugiere cuándo conviene contratar servicios de WAY UP. No afirmes haber rastreado toda la web.")}>Interpretar resultados con Groq</button>
      </div>}
    </>}
    {error && <p role="alert" style={{ color: "#b42318", marginTop: 8 }}>{error}</p>}
    <small style={{ display: "block", marginTop: 10, color: "#707887" }}>Resultados de Google · Diagnóstico orientativo, no una auditoría completa.</small>
  </div>;
}
