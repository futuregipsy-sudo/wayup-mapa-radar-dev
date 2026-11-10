import { useState } from "react";

/** Pilot map: OpenStreetMap tiles via iframe; geocoding is explicit, never on each keystroke. */
export function WayAppMap({ mode = "all" }: { mode?: "all" | "map" | "radar" }) {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [radar, setRadar] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [radarBusy, setRadarBusy] = useState(false);
  const [radarError, setRadarError] = useState("");
  async function scanRadar() {
    if (radarBusy) return;
    setRadarBusy(true);
    setRadarError("");
    setRadar([]);
    try {
      if (!place) { setRadarError("Primero busca una ubicación para escanear."); return; }
      const lat = place.lat;
      const lon = place.lon;
      const query = '[out:json][timeout:20];(nwr(around:1000,' + lat + ',' + lon + ')["name"]["amenity"~"restaurant|cafe|bar"];nwr(around:1000,' + lat + ',' + lon + ')["name"]["shop"];);out center 50;';
      const response = await fetch('https://overpass.kumi.systems/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: query }) });
      if (!response.ok) throw new Error('Servicio de radar temporalmente no disponible');
      const data: { elements?: Array<{ id: number; type: string; tags?: Record<string,string> }> } = await response.json();
      setRadar((data.elements ?? []).map(x => ({ id: x.type + '/' + x.id, name: x.tags?.name ?? 'Sin nombre', type: x.tags?.amenity ?? x.tags?.shop ?? 'negocio' })));
    } catch (error) {
      setRadarError(error instanceof Error ? error.message : 'Error al buscar negocios');
    } finally { setRadarBusy(false); }
  }

  function analyzeWithAI() {
    if (!radar.length) return;
    const location = place?.label ?? "ubicación seleccionada";
    const items = radar.slice(0, 12).map(item => item.name + " (" + item.type + ", OSM " + item.id + ")").join("; ");
    const prompt = ("Analiza los negocios encontrados por el Radar OpenStreetMap cerca de " + location + ": " + items + ". Sugiere oportunidades digitales, sin inventar datos ni afirmar haber auditado sus webs.").slice(0, 1900);
    window.dispatchEvent(new Event("wayapp:open"));
    window.dispatchEvent(new CustomEvent("wayapp:radar-analyze", { detail: { prompt } }));
  }
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError("");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("El servicio de búsqueda no está disponible");
      const data: Array<{ lat: string; lon: string; display_name: string }> = await response.json();
      if (!data.length) { setError("No se encontró ese lugar"); return; }
      const lat = Number(data[0].lat), lon = Number(data[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Coordenadas no válidas");
      setPlace({ lat, lon, label: data[0].display_name });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo buscar el lugar");
    } finally { setLoading(false); }
  }
  const lat = place?.lat ?? 40.4168;
  const lon = place?.lon ?? -3.7038;
  const delta = 0.025;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  const mapUrl = "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(bbox) + "&layer=mapnik&marker=" + encodeURIComponent(lat + "," + lon);
  return (
    <section id="wayapp-mapa" aria-label="Mapa WAY.APP" style={{ padding: mode === "all" ? "48px 20px" : "12px 0", maxWidth: 1100, margin: "0 auto" }}>
      {mode === "all" && <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)", fontWeight: 700, marginBottom: 12 }}>Explora el mapa con WAY.APP</h2>}
      <p style={{ marginBottom: 20 }}>Busca una ciudad, dirección o negocio para localizarlo en el mapa.</p>
      <form onSubmit={search} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <input aria-label="Buscar lugar en el mapa" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ej.: Salamanca, Plaza Mayor" minLength={3} maxLength={160} required style={{ flex: "1 1 250px", padding: 12, borderRadius: 8, border: "1px solid #999", color: "#111", background: "#fff" }} />
        <button type="submit" disabled={loading || query.trim().length < 3} style={{ padding: "12px 24px", borderRadius: 8, background: "#2349cc", color: "white", cursor: "pointer" }}>{loading ? "Buscando…" : "Buscar en el mapa"}</button>
      </form>
      {error && <p role="alert" style={{ marginBottom: 12 }}>{error}</p>}
      {place && <p aria-live="polite" style={{ marginBottom: 12 }}>Ubicación: {place.label}</p>}
      <iframe title="Mapa interactivo OpenStreetMap" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: mode === "all" ? 440 : 240, border: "1px solid #888", borderRadius: 12 }} />
      <p style={{ marginTop: 8, fontSize: 12 }}>© Colaboradores de OpenStreetMap · Búsqueda mediante Nominatim</p>

      {mode !== "map" && <section aria-label="Radar de negocios" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 24, fontWeight: 700 }}>Smart Radar · Piloto</h3>
        <p>Negocios registrados en OpenStreetMap a 1 km del centro del mapa.</p>
        <button type="button" disabled={radarBusy || !place} onClick={scanRadar} style={{ padding: 12, background: "#2349cc", color: "white", borderRadius: 8 }}>{radarBusy ? "Escaneando…" : "Escanear negocios"}</button>
        {radarError && <p role="alert">{radarError}</p>}
        <p aria-live="polite">{radar.length} negocios encontrados</p>
        {radar.length > 0 && <button type="button" onClick={analyzeWithAI} style={{ padding: 12, marginTop: 10, borderRadius: 8, background: "#172d79", color: "white" }}>Analizar con WAY.APP IA</button>}
        <ul style={{ maxHeight: 320, overflowY: "auto" }}>
          {radar.map(item => <li key={item.id}><strong>{item.name}</strong> · {item.type} · <a href={"https://www.openstreetmap.org/" + item.id} target="_blank" rel="noopener noreferrer">Ver en mapa</a></li>)}
        </ul>
      </section>}
    </section>
  );
}
