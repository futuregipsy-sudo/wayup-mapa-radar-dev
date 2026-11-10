import { useState } from "react";

export function StripeCheckoutButton({ service }: { service: "marketing" | "social" | "web" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "No se ha podido preparar el pago.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar el pago.");
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <button type="button" disabled={busy} onClick={checkout}
        className="w-full rounded-full border border-primary px-6 py-3 font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50">
        {busy ? "Preparando pago seguro…" : "Pagar con Stripe"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
