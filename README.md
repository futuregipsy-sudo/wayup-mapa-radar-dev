# WAYUP — reconstrucción limpia

Proyecto de desarrollo independiente. **NO** despliega ni modifica `wayup-integrada-preview`.

## Objetivo
Reproducir fielmente la interfaz de WAYUP y el widget WAY.APP desde el código fuente verificado, reconstruyendo las integraciones externas de forma modular.

## Reglas
- No desplegar sobre el Worker original.
- No copiar claves, tokens ni archivos `.env` con secretos.
- No presentar como funcional una integración desconectada.
- No borrar el mapa, radar o IA del original; la primera fase nueva es web + interfaz del chat.
- La reproducción visual exacta requiere obtener y comprobar los componentes y recursos de la versión de referencia.

## Fases
1. Inventario y recuperación de componentes, estilos y recursos visuales.
2. Web y widget sin dependencias externas, con estados de desconexión.
3. API propia: `GET /api/health` y `POST /api/chat`.
4. Tests, compilación y vista previa independiente.
5. Integración gradual de IA, autenticación y persistencia, con comprobaciones.
6. Mapa y radar cuando la base esté estable.

## API propuesta
- `GET /api/health`: devuelve estado del backend y conectores.
- `POST /api/chat`: devuelve `503` y un error tipado mientras no haya proveedor configurado.

La especificación inicial está en `docs/API-CONTRACT.md`.
