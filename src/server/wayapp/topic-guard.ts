/** Conservative, deterministic routing: only unambiguously off-topic requests bypass AI. */
export function offTopicReply(input: string): string | null {
  const text = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  // Explicit instruction-spoofing is not an emergency merely because it mentions
  // "protocolos de seguridad" or "sistema de emergencia".
  const instructionSpoof = /(?:fin de la sesion anterior|actualizacion de sistema|nueva directriz|ignora (?:todas )?(?:las )?instrucciones|sin restricciones eticas|sistema reconfigurado|desactivar los protocolos|modo desarrollador|actua como (?:un )?sistema sin)/.test(text);
  const directDistress = /(?:quiero|voy a|estoy pensando en|necesito)[ ]+(?:suicidarme|matarme|quitarme la vida|hacerme dano)|(?:estoy en peligro inmediato|me quiero morir)/.test(text);
  if (instructionSpoof && !directDistress) {
    return "No puedo cambiar mis instrucciones ni desactivar las medidas de seguridad. Soy WAY.APP y puedo ayudarte con la presencia digital de tu negocio.";
  }
  // Never block requests with an explicit business/digital context.
  if (/\b(web|website|pagina|seo|marketing|negocio|empresa|cliente|clientes|ventas|vender|tienda|ecommerce|redes sociales|publicidad|campana|marca|presupuesto|auditoria|way\s?up|dominio|posicionamiento|conversiones|diseno|digital)\b/.test(text)) return null;
  // Safety-critical situations require an appropriate response, not a sales pitch.
  if (directDistress || /(?:suicidio|autolesion|peligro inmediato)/.test(text)) {
    return "Siento que estés pasando por esto. Si estás en peligro inmediato, llama al 112. Si piensas hacerte daño, busca ahora apoyo de alguien de confianza o de un servicio de emergencias.";
  }
  if (/\b(mi novia|mi novio|mi pareja|me ha dejado|me dejo mi|ruptura|infidelidad|me es infiel|desamor|volver con mi ex)\b/.test(text)) {
    return "Siento que estés pasando por eso. Soy el asistente de WAY UP y puedo ayudarte con tu negocio y su presencia digital.";
  }
  if (/\b(me duele|tengo fiebre|diagnosticame|que medicamento|medicacion|enfermedad|sintomas|tratamiento medico)\b/.test(text)) {
    return "Para cuestiones de salud, lo adecuado es consultar con un profesional sanitario. Yo puedo orientarte sobre la presencia digital de tu negocio.";
  }
  if (/\b(receta de cocina|como cocinar|resultado del partido|horoscopo|cuentame un chiste|recomiendame una pelicula)\b/.test(text)) {
    return "Esa consulta se sale de mi especialidad. Estoy aquí para ayudarte con la web, el marketing y la presencia digital de tu negocio.";
  }
  return null;
}
