/** Deterministic, zero-token commercial intent scoring. */
export function commercialIntentScore(message: string): number {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^(?:¿?que es el seo\??|quiero mejorar mi web)$/i.test(text.trim())) return 0;
  let score = 0;
  if (/\b(quiero contratar|solicitar auditoria|quiero una auditoria|presupuesto|cuanto cuesta|precio|precios|plazos|quiero contactar|quiero hablar|request a quote)\b/.test(text)) score += 3;
  if (/\b(necesito|quiero|busco|me interesa|estoy interesado|estoy interesada|crear|hacer|montar|desarrollar|redisenar|rediseño)\b/.test(text)) score += 1;
  if (/\b(pagina web|sitio web|una web|mi web|web profesional|tienda online|ecommerce|e-commerce|marketing|seo|redes sociales|diseno web|concesionario|negocio|empresa|auditoria gratuita|more information|free audit)\b/.test(text)) score += 2;
  if (/\b(mas informacion|quiero informacion|necesito informacion|como contratar|contactar con vosotros|how can i contact)\b/.test(text)) score += 3;
  if (/\b(me interesa|estoy interesado|estoy interesada)\b/.test(text)) score += 2;
  if (/\b(me gusta|quiero mejorar mi web)\b/.test(text) && score < 3) return 0;
  return score;
}
export function hasCommercialIntent(message: string): boolean {
  return commercialIntentScore(message) >= 2;
}
