# WAYUP × WAY.APP — auditoría de integración

Fecha: 2026-11-08
Repositorio: `francopdimauro-cyber/WAYUP`
Rama de trabajo: `migration/cloudflare-widget`
Base inspeccionada: `main`

## Hallazgos

1. WAYUP es una aplicación TanStack Start/React con build gestionado por `@lovable.dev/vite-tanstack-config`. El comentario de `vite.config.ts` indica que Nitro usa Cloudflare como target predeterminado. No conviene sustituir esta configuración por un Vite config genérico.
2. En el árbol de `main` no se encontró `embed.js`, `wrangler.jsonc` ni una integración completa del iframe WAY.APP.
3. Existe `src/components/WayAppGreeting(1).tsx`, que solo renderiza una burbuja de saludo fija. No implementa un chat ni carga el widget externo.
4. El repositorio WAY.APP sí contiene `public/embed.js`, que intenta montar un launcher inline en `#wayapp-hero-widget` o un launcher flotante, y carga `/embed` desde el origen de WAY.APP.
5. El código de WAY.APP contiene una ruta `/embed` y un mecanismo `postMessage` para cerrar el iframe. La integración debe validar tanto `event.origin` como `event.source` y usar una lista de dominios estricta.
6. El Worker `wayup1` de Cloudflare tiene un binding de assets y compatibilidad Node, pero la cuenta no muestra Custom Domains de Workers. No se ha verificado que el Worker corresponda al despliegue actual de WAYUP ni que el dominio público apunte a él.

## Diseño recomendado de integración

- WAYUP mantiene su propia app y despliegue; WAY.APP mantiene el suyo.
- WAYUP solo incluye el script público de WAY.APP una vez y con el selector `data-target="#wayapp-hero-widget"` para el montaje inline deseado.
- El script debe servirse desde el dominio canónico final de WAY.APP y cargar el iframe `/embed` desde ese mismo origen.
- No duplicar el saludo React local si el launcher real de WAY.APP ya muestra su propio saludo.
- Mantener el iframe con título accesible, carga diferida, altura responsive y controles open/close.
- La CSP de WAYUP debe permitir `script-src` para el origen del embed y `frame-src` para el origen de WAY.APP. La CSP de WAY.APP debe permitir `frame-ancestors` solo para los dominios WAYUP de producción y staging.
- El API de WAY.APP debe aceptar únicamente los orígenes exactos que realmente llaman a sus endpoints desde navegador.
- No introducir dominios de preview indiscriminadamente en producción; definirlos por entorno.

## Pruebas de aceptación

- Una sola instancia del launcher tras hidratación React/TanStack.
- Montaje inline en el contenedor correcto y modo flotante solo cuando se solicita explícitamente.
- No duplicar el componente de saludo local.
- Apertura/cierre desde el launcher y desde el iframe.
- Mensajes postMessage rechazados si el origen o la ventana de origen no coinciden.
- Funcionamiento en móvil, tablet y escritorio.
- No hay errores CSP ni bloqueos de iframe.
- No se filtran secretos ni tokens al navegador.
- WAYUP sigue funcionando si WAY.APP está temporalmente indisponible.

## No realizado

No se han modificado componentes, rutas, CSP ni configuración de producción. No se ha desplegado ni cambiado el Worker `wayup1`. Esta rama contiene únicamente el documento de auditoría hasta que WAY.APP tenga un origen de staging funcional.
