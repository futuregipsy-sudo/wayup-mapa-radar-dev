import { describe, expect, it } from "vitest";
import { hasCommercialIntent } from "./commercial-intent";

describe("commercial intent detection", () => {
  it.each(["Quiero más información", "Me interesa", "Quiero contratar", "¿Podéis darme un presupuesto?", "Solicitar auditoría gratuita", "More information"])("offers an audit for %s", (message) => {
    expect(hasCommercialIntent(message)).toBe(true);
  });
  it.each(["Hola", "¿Qué es el SEO?", "Me gusta el diseño", "Quiero mejorar mi web"])("does not force an offer for %s", (message) => {
    expect(hasCommercialIntent(message)).toBe(false);
  });
});
