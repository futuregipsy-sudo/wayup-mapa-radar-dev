import { useMemo, useState } from "react";

type Concept = "symbol" | "monogram" | "energy";
const COLORS = ["#2445ed", "#101b37", "#e6ad51", "#2b7869", "#bd5d74", "#6a46b9"];
function escapeXml(s: string) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] || c); }
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BrandingStudio({ onBrief }: { onBrief: (prompt: string) => void }) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [style, setStyle] = useState("Minimalista premium");
  const [audience, setAudience] = useState("");
  const [concept, setConcept] = useState<Concept>("monogram");
  const [color, setColor] = useState("#2445ed");
  const [background, setBackground] = useState("#fffdf8");
  const [tagline, setTagline] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const initials = name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() || "").join("") || "W";
  const svg = useMemo(() => {
    const mark = concept === "energy"
      ? `<path d="M260 58 137 267h111l-20 187 173-258H283l28-138Z" fill="${color}"/>`
      : concept === "symbol"
      ? `<circle cx="260" cy="230" r="135" fill="none" stroke="${color}" stroke-width="32"/><path d="M185 250 250 310 340 160" fill="none" stroke="${color}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<rect x="116" y="75" width="288" height="288" rx="70" fill="${color}"/><text x="260" y="268" text-anchor="middle" font-family="Georgia,serif" font-size="136" fill="#fff">${escapeXml(initials)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${background}"/><g transform="translate(140 50) scale(1)">${mark}</g><text x="400" y="545" text-anchor="middle" font-family="Georgia,serif" font-size="65" fill="${color}">${escapeXml(name.trim().slice(0, 36) || "Tu marca")}</text><text x="400" y="605" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" letter-spacing="3" fill="${color}">${escapeXml(tagline.slice(0, 45))}</text></svg>`;
  }, [name, tagline, concept, color, background, initials]);
  async function generate() {
    if (!name.trim() || !sector.trim() || busy) return;
    setBusy(true); setError(""); setPreview("");
    try {
      const response = await fetch("/api/branding/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), sector: sector.trim(), concept, style, colors: color }) });
      const data = await response.json() as { preview?: string; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "No se pudo generar la vista previa.");
      setPreview(data.preview);
    } catch (e) { setError(e instanceof Error ? e.message : "Error de generación."); }
    finally { setBusy(false); }
  }
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d9ddeb", borderRadius: 10, color: "#152452", background: "#fff" };
  const button: React.CSSProperties = { padding: "11px 13px", borderRadius: 10, background: "#2445ed", color: "#fff", border: 0, fontWeight: 700, cursor: "pointer" };
  return <div style={{ padding: "12px 0", color: "#172653", fontSize: 14 }}>
    <p style={{ lineHeight: 1.5, margin: "0 0 14px" }}>Crea un concepto de marca editable en SVG y, opcionalmente, una imagen de inspiración generada con IA. El SVG es una composición vectorial propia, no una vectorización de la imagen de IA.</p>
    <div style={{ display: "grid", gap: 10 }}>
      <label>Nombre de marca<input style={input} value={name} onChange={e => setName(e.target.value)} maxLength={36} placeholder="Ej. Aurora Studio" /></label>
      <label>Sector<input style={input} value={sector} onChange={e => setSector(e.target.value)} maxLength={120} placeholder="Ej. Arquitectura" /></label>
      <label>Eslogan opcional<input style={input} value={tagline} onChange={e => setTagline(e.target.value)} maxLength={45} /></label>
      <label>Estilo<select style={input} value={style} onChange={e => setStyle(e.target.value)}><option>Minimalista premium</option><option>Urbano contemporáneo</option><option>Editorial elegante</option><option>Geométrico moderno</option><option>Orgánico artesanal</option></select></label>
      <label>Público objetivo<input style={input} value={audience} onChange={e => setAudience(e.target.value)} maxLength={120} placeholder="Ej. Jóvenes profesionales" /></label>
      <fieldset style={{ border: "1px solid #d9ddeb", borderRadius: 12, padding: 10 }}><legend>Concepto</legend><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{([["monogram","Monograma"],["symbol","Símbolo"],["energy","Dinámico"]] as const).map(([v,t]) => <button key={v} type="button" aria-pressed={concept===v} onClick={() => setConcept(v)} style={{ ...button, background: concept===v ? "#2445ed" : "#edf0ff", color: concept===v ? "#fff" : "#172653" }}>{t}</button>)}</div></fieldset>
      <div><strong>Paleta</strong><div style={{ display: "flex", gap: 9, paddingTop: 8, flexWrap: "wrap" }}>{COLORS.map(c => <button key={c} type="button" aria-label={"Color "+c} aria-pressed={color===c} onClick={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: "50%", background: c, border: color===c ? "3px solid #111" : "2px solid #ddd", cursor: "pointer" }} />)}<input aria-label="Color personalizado" type="color" value={color} onChange={e => setColor(e.target.value)} /></div></div>
      <label>Fondo <input type="color" value={background} onChange={e => setBackground(e.target.value)} /></label>
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #e4e6ed", background: background }}><img src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)} alt="Previsualización vectorial editable del logotipo" style={{ width: "100%", maxHeight: 330, objectFit: "contain" }} /></div>
      <button type="button" style={button} onClick={() => download((name.trim() || "wayapp-logo").replace(/[^a-z0-9_-]/gi,"-")+".svg", svg, "image/svg+xml")}>Descargar SVG editable</button>
      <button type="button" style={{ ...button, background: "#152452" }} disabled={!name.trim() || !sector.trim() || busy} onClick={() => void generate()}>{busy ? "Generando inspiración..." : "Generar concepto visual con IA"}</button>
      {preview && <div><img src={preview} alt="Concepto visual generado por IA" style={{ width: "100%", borderRadius: 12 }} /><small>Imagen conceptual, no logotipo vectorial final.</small></div>}
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      <button type="button" style={{ ...button, background: "#edf0ff", color: "#152452" }} disabled={!name.trim() || !sector.trim()} onClick={() => onBrief("Propón tres direcciones de identidad visual para "+name+". Sector: "+sector+". Público: "+audience+". Estilo: "+style+". Color principal: "+color+". No afirmes haber creado archivos ni imágenes.")}>Refinar identidad con WAY.APP</button>
      <small>La generación con IA tiene límites de uso y requiere credenciales de Cloudflare AI. El editor SVG funciona sin proveedor externo.</small>
    </div>
  </div>;
}
