# Auditoría de seguridad y migración Cloudflare — fase 1

Fecha: 2026-11-09
Rama: audit/cloudflare-security-cleanup
Base inmutable: 4da33db3ebaf258b3826807965245fb88a17798f
Alcance: solo francopdimauro-cyber/WAYUP. NO modificar frankieatu63-cyber/WAYUP-publico.

## Hallazgos preliminares (revisión estática, sin explotación confirmada)

### P1 — Revisar confianza dinámica en orígenes OAuth
- src/server/wayapp/auth.ts: trustedOrigins incluye `origin` calculado desde la URL de cada petición.
- Verificar si el adaptador/runtime permite manipular Host/Forwarded y si Better Auth acepta orígenes no previstos. Preferir orígenes canónicos explícitos y pruebas de callback/login antes de modificar.
- Estado: pendiente de validación dinámica.

### P1 — Revisar suplantación de IP en el rate limiter
- src/server/wayapp/chat.ts: clientIp acepta cf-connecting-ip, x-real-ip y x-forwarded-for.
- Si el Worker puede recibir cabeceras aportadas por clientes o tráfico fuera del proxy esperado, el límite por IP podría eludirse. Validar procedencia confiable y fallback seguro.
- Estado: pendiente de pruebas.

### P2 — Límite de tamaño de solicitudes
- src/server/wayapp/chat.ts: el Content-Length se comprueba, pero request.text() materializa el cuerpo antes de medir el tamaño real.
- Evaluar lectura incremental con límite efectivo y prueba de cuerpo chunked >64 KiB.
- Estado: mejora recomendada.

### P2 — Streaming y persistencia
- src/server/wayapp/chat.ts: el streaming transmite tokens antes de confirmar persistencia del mensaje del asistente; revisar desconexiones, cancelación, tamaño máximo de salida y consistencia de conversación.
- src/components/wayapp/WayAppChat.tsx: revisar tratamiento de eventos de error durante streaming y representación de respuestas parciales.
- Estado: pendiente de pruebas de fallo.

### P2 — Estado público
- src/server/wayapp/health.ts: /api/health expone booleanos sobre proveedores, OAuth, esquema y rate limit. No expone secretos, pero facilita reconocimiento de infraestructura.
- Valorar estado público mínimo y diagnóstico detallado restringido.
- Estado: decisión pendiente.

### P2 — Telemetría del editor
- src/lib/lovable-error-reporting.ts: envía errores y stack al hook del editor si existe.
- Verificar si se incluye en producción y qué datos podrían transmitirse. No eliminar sin confirmar que no afecta a recuperación de errores.
- Estado: pendiente.

## Funcionalidades que no deben romperse
- Web pública, navegación e idiomas, SEO y sitemap.
- Widget React integrado de WAY.APP: abrir/cerrar, maximizar, nueva conversación, streaming.
- /api/chat con Groq, historial y propiedad de conversación.
- OAuth Google, sesiones Better Auth, allowlist y panel privado.
- Neon PostgreSQL y Upstash Redis hasta que exista migración validada.
- Cloudflare Worker de vista previa y despliegue actual.

## Pruebas obligatorias antes de fusionar
1. npm ci; npm run lint; npm test; npm run build.
2. Comprobar rutas públicas, /api/chat, /api/health, /admin.
3. OAuth Google: inicio, callback, sesión, cierre, usuario no autorizado.
4. Chat: origin válido/inválido, tamaño >64 KiB, rate limit, IP falsificada, fallo Redis, fallo Groq, corte de streaming.
5. Verificar secretos y variables en Cloudflare sin imprimir valores.
6. Revisar integraciones y configuración de Vercel antes de desactivarlas.
7. Comparar la vista previa contra la versión de referencia; no tocar producción hasta aprobar.

## Regla de cambios
No borrar ramas, servicios, endpoints, datos ni configuraciones de producción hasta validar dependencias y rollback. Cada cambio debe ser pequeño, reversible y probado.
