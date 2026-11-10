# WAYUP con WAY.APP integrado

Punto de recuperación guardado el 9 de noviembre de 2026 (hora de Madrid).

## Código y despliegue verificados

- Repositorio público [francopdimauro-cyber/WAYUP](https://github.com/francopdimauro-cyber/WAYUP).
- Código de la vista previa [`12f412d`](https://github.com/francopdimauro-cyber/WAYUP/commit/12f412d92ea4c4bd1f7c2b12ffee50cbad0f64fd), rama `fix/wayapp-admin-link`.
- Worker de Cloudflare `wayup-integrada-preview`, versión activa al guardar este registro `89e03a66-fdf0-4fb0-aeed-67d30055f431`. Fecha de compatibilidad `2026-11-08`.
- [Web pública de prueba](https://wayup-integrada-preview.francopdimauro.workers.dev/), [panel de administración](https://wayup-integrada-preview.francopdimauro.workers.dev/admin) y [estado del backend](https://wayup-integrada-preview.francopdimauro.workers.dev/api/health).

La rama pasó los 42 tests y compiló. La API pública del chat devolvió una respuesta de Groq y un ID de conversación. El enlace «Acceso de administración» está publicado en el pie. El estado del backend devolvió `ready: true` y `googleOAuth: true`. El inicio de Google devolvió el callback previsto. Sigue pendiente comprobar con una cuenta autorizada que se puede entrar al panel y abrir una conversación.

## Reconstruir la compilación

Desde un checkout de este punto de recuperación, con Node.js 24 y npm:

```powershell
npm ci
npm run test
npm run build
```

Para probar en local, usa un `.env.local` con las credenciales del entorno de prueba y arranca la salida generada con Wrangler:

```powershell
npx --yes wrangler@4.158.0 dev --config .output/server/wrangler.json --env-file .env.local --local --ip 127.0.0.1 --port 8788
```

Para publicar en el mismo Worker de prueba, ajusta el nombre y la fecha de compatibilidad en el archivo generado antes de desplegar. Si Wrangler muestra otras diferencias de configuración, revísalas antes de continuar.

```powershell
node -e "const fs = require('node:fs'), p = '.output/server/wrangler.json', c = JSON.parse(fs.readFileSync(p, 'utf8')); c.name = 'wayup-integrada-preview'; c.compatibility_date = '2026-11-08'; fs.writeFileSync(p, JSON.stringify(c, null, 2))"
npx --yes wrangler@4.158.0 deploy --config .output/server/wrangler.json --name wayup-integrada-preview --keep-vars
```

## Dependencias del entorno de prueba

- Groq para las respuestas, con `GROQ_API_KEY` y el modelo opcional `GROQ_MODEL`.
- Upstash Redis para el límite de peticiones, con `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
- Proyecto Neon de prueba `wayup-local`, rama `main`, base `neondb`, con `NEON_DATABASE_URL`. En una base vacía, aplicar [la migración inicial](../db/migrations/0001_wayapp.sql).
- Google OAuth y Better Auth, con `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y `WAYAPP_ADMIN_EMAILS`. Para el Worker de prueba, el origen es `https://wayup-integrada-preview.francopdimauro.workers.dev` y el URI de redirección autorizado es `https://wayup-integrada-preview.francopdimauro.workers.dev/api/auth/callback/google`.

Las credenciales se administran en Cloudflare o en el archivo local ignorado por Git. Este registro guarda código y pasos de recuperación. Los secretos y los datos de las conversaciones quedan en sus servicios correspondientes.

## Validación antes del dominio definitivo

Configurar el origen definitivo en `BETTER_AUTH_URL` y registrar en Google su URI de redirección `/api/auth/callback/google`. En ese dominio, enviar un mensaje desde el widget, iniciar sesión con el correo autorizado y abrir esa conversación en `/admin`. Ver [la guía de integración](WAYAPP-INTEGRACION.md) para el contexto del proyecto.
