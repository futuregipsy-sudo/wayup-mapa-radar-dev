import { useState, type FormEvent } from "react";

/** Quotes are drafted and approved by an authenticated administrator, never by WAY.APP autonomously. */
export function StripeQuoteForm() {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setUrl("");
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 100 || cents > 10000000) {
      setError("Introduce un importe válido entre 1 y 100.000 €.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/stripe-quote", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amountCents: cents, email, reference }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "No se pudo generar el enlace.");
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wa-admin-card" style={{ marginTop: 24 }}>
      <div className="wa-admin-card-head"><h2>Presupuesto personalizado · Stripe</h2></div>
      <p>Comprueba el alcance y acuerda el importe con el cliente antes de generar el enlace. No se envía automáticamente.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>Servicio acordado<input required minLength={5} maxLength={180} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Rediseño web profesional" /></label>
        <label>Importe acordado (€)<input required type="number" min="1" max="100000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Email del cliente (opcional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Referencia única del presupuesto<input required minLength={3} maxLength={60} pattern="[a-zA-Z0-9_-]+" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="WAYUP-2026-001" /></label>
        <button type="submit" disabled={busy}>{busy ? "Preparando enlace…" : "Generar enlace de pago"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {url && <p style={{ overflowWrap: "anywhere" }}>Enlace listo para revisar y compartir: <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>}
    </section>
  );
}
