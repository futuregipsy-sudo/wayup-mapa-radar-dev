import { useState } from "react";

export function BrandingStudio({ onBrief }: { onBrief: (prompt: string) => void }) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [style, setStyle] = useState("");
  const [audience, setAudience] = useState("");
  const [colors, setColors] = useState("");
  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d9ddeb", borderRadius: 10, color: "#152452", background: "#fff" };
  const fields = [
    { label: "Nombre de tu marca", value: name, set: setName, placeholder: "Ej.: Café Aurora", required: true },
    { label: "¿A qué se dedica?", value: sector, set: setSector, placeholder: "Ej.: Cafetería artesanal", required: true },
    { label: "Estilo que buscas", value: style, set: setStyle, placeholder: "Ej.: Elegante, minimalista, urbano" },
    { label: "¿A quién te diriges?", value: audience, set: setAudience, placeholder: "Ej.: Jóvenes profesionales" },
    { label: "Colores o preferencias", value: colors, set: setColors, placeholder: "Ej.: Verde oscuro y crema" },
  ];
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = [
      "WAY.APP Design Studio: el cliente solicita propuestas visuales. Responde únicamente con tres opciones de tres líneas cada una (9 líneas de propuesta).",
      "Marca: " + name.trim(), "Sector: " + sector.trim(), "Estilo: " + (style.trim() || "por definir"),
      "Público: " + (audience.trim() || "por definir"), "Colores: " + (colors.trim() || "por definir"),
      "Para cada opción: línea 1 nombre en negrita, línea 2 composición, línea 3 colores y estilo. No incluyas briefing, personalidad de marca, tipografías, apartados pendientes ni preguntas adicionales, salvo cuál de las tres prefiere. No afirmes haber generado imágenes ni cobrado."
    ].join("\n");
    onBrief(prompt);
  }
  return <div style={{ padding: "14px 0", color: "#172653", fontSize: 14 }}>
    <p style={{ margin: "0 0 12px", lineHeight: 1.55 }}>Cuéntanos tu idea y WAY.APP preparará una dirección creativa para tu marca. Estamos preparando la generación visual, la vista previa gratuita y la descarga de pago.</p>
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      {fields.map(f => <label key={f.label} style={{ display: "grid", gap: 5, fontWeight: 600 }}>{f.label}<input style={input} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} maxLength={120} required={f.required} /></label>)}
      <button type="submit" disabled={!name.trim() || !sector.trim()} style={{ padding: "12px", background: "#2948ed", border: 0, color: "white", fontWeight: 700, borderRadius: 12, cursor: "pointer" }}>Preparar concepto con WAY.APP</button>
    </form>
    <p style={{ marginTop: 14, fontSize: 12, color: "#69758e" }}>Sin pago en esta fase. No se generan imágenes ni se habilitan descargas todavía.</p>
  </div>;
}
