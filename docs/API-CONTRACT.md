# Contrato de API v1 — propuesta

El contrato se implementará al integrar el framework de servidor. Este documento **no implica que los endpoints estén desplegados**.

## GET /api/health

HTTP 200, JSON:

```json
{
  "status": "ok",
  "app": "WAYUP",
  "backend": "online",
  "integrations": {
    "ai": "disconnected",
    "auth": "disconnected",
    "database": "disconnected",
    "cache": "disconnected"
  }
}
```

No exponer nombres ni valores de secretos en la respuesta.

## POST /api/chat

Solicitud:

```json
{ "message": "Hola" }
```

Sin proveedor habilitado: HTTP 503

```json
{
  "error": {
    "code": "AI_NOT_CONFIGURED",
    "message": "El asistente no está conectado todavía."
  }
}
```

Cuando se active un proveedor: validar entrada, limitar tamaño, establecer timeouts y rate limiting, y mantener credenciales solo en el servidor.

## Aislamiento
No leer ni reutilizar variables de producción. Cada entorno tendrá sus propios bindings y secretos, configurados expresamente.
