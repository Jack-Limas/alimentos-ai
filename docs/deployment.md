# Despliegue de alimentos-ai

Servicio interno: solo lo llama `alimentos-backend`, servidor a servidor, con `X-Internal-Key`.
Ningún valor real aparece aquí; las claves viven en el panel de Render y en el `.env` local.

## 1. Variables (sin valores)

| Variable                 | Obligatoria | Uso                                                                          |
| ------------------------ | ----------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`               | Sí          | `production`: errores 500 sin mensaje interno                                |
| `AI_INTERNAL_KEY`        | Sí          | ≥ 32 caracteres; **la misma** que `AI_INTERNAL_KEY` del backend              |
| `GEMINI_API_KEY`         | Para la IA  | Clave de Google AI Studio. Solo existe en este servicio                      |
| `GEMINI_MODEL`           | Para la IA  | Modelo de Gemini (uno flash / flash-lite)                                    |
| `AI_UPSTREAM_TIMEOUT_MS` | No          | 12000 por defecto, máximo 14000 (siempre por debajo de los 15 s del backend) |
| `PORT`                   | —           | No se define: Render la inyecta                                              |
| `AI_SMOKE_URL`           | Solo local  | URL del servicio desplegado para `npm run smoke:prod` (nunca en Render)      |

Sin `GEMINI_API_KEY` el servicio arranca igual (`/health` → `geminiConfigured: false`) y el
backend degrada: `AI_ASSISTED` usa el resultado de reglas y `/ai/*` responde 503.

## 2. Despliegue en Render

| Ajuste        | Valor                                   |
| ------------- | --------------------------------------- |
| Tipo          | Web Service (Node 22)                   |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start`                             |
| Health Check  | `/health`                               |

Orden con el resto del sistema: este servicio va **antes** que el backend (no depende de nadie).
Después de cada deploy:

```bash
AI_SMOKE_URL=https://<ai>.onrender.com npm run smoke:prod   # AI_INTERNAL_KEY se lee del entorno o del .env
```

Comprueba `/health`, que `/v1` sin clave responda 401 y los tres endpoints con los fixtures de
`scripts/fixtures/`. Imprime latencia y tokens por endpoint; `QUOTA_EXCEEDED` es **WARN** (no
falla), cualquier otro error es FAIL y el comando sale con código 1. Nunca imprime la clave.

## 3. Rollback

- Render → servicio → _Deploys_ → **Rollback** en el deploy anterior que estaba sano (o _Manual
  Deploy_ del commit previo). El servicio no tiene base de datos: no hay datos que revertir.
- Si el problema es el modelo (`MODEL_NOT_FOUND`) o la clave (`INVALID_API_KEY`), basta con
  corregir la variable; Render reinicia el servicio.
- Mientras tanto el backend sigue funcionando: degrada a reglas y lo muestra en la UI.
- Verificar con `npm run smoke:prod` (aquí) y `npm run smoke:prod` del backend.

## 4. Rotar `AI_INTERNAL_KEY`

El servicio acepta **una** clave a la vez, así que la nueva se pone en los dos servicios **al mismo
tiempo**, empezando por la IA:

1. Genera una clave nueva (≥ 32 caracteres), por ejemplo
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. No la pegues en
   chats ni la commitees.
2. En Render, **primero** en `alimentos-ai` y **enseguida** en `alimentos-backend`: edita
   `AI_INTERNAL_KEY` y guarda en ambos sin esperar entre uno y otro (cada uno se reinicia solo).
3. Durante el minuto en que solo uno tiene la clave nueva, las llamadas reciben 401: el backend lo
   trata como fallo de la IA y **degrada** (`AI_ASSISTED` → reglas, `/ai/*` → 503). No se pierde
   nada ni se confirma nada a medias.
4. Verifica: `npm run smoke:prod` aquí (con la clave nueva en tu entorno local) y el smoke del
   backend (la propuesta `AI_ASSISTED` deja de salir degradada).
5. Actualiza tu `.env` local.

## 5. Rotar `GEMINI_API_KEY`

1. En Google AI Studio → _API keys_, crea una clave nueva en el mismo proyecto.
2. En Render (`alimentos-ai`) reemplaza `GEMINI_API_KEY` y guarda (reinicio automático).
3. `npm run smoke:prod` → los tres endpoints en PASS.
4. **Después** borra la clave vieja en AI Studio. Si la vieja se filtró, bórrala primero: durante
   ese rato el backend degrada, pero la clave filtrada deja de servir de inmediato.

La clave nunca sale de este servicio: no se registra en logs, el error de Google no se reenvía (se
reemplaza por un mensaje fijo por categoría) y `/health` solo dice si existe.

## 6. Cuotas del plan gratis de AI Studio

- El plan gratis limita por **modelo** las peticiones por minuto (RPM), los tokens por minuto (TPM)
  y las peticiones por día (RPD). Los valores vigentes se ven en AI Studio → _Rate limits_; cambian
  con el tiempo y por modelo, por eso no se fijan aquí. La cuota diaria se reinicia a medianoche,
  hora del Pacífico.
- Cada llamada a `/v1/*` es una petición a Gemini (dos si hubo reintento por 5xx o JSON inválido).
  Las explicaciones de propuestas quedan **en caché** en el backend (`aiInsight`), así que repetirlas
  no gasta cuota. Con `flash-lite` una llamada usa del orden de 600–900 tokens de entrada y 150–250
  de salida.
- Este servicio limita además `/v1` a **30 peticiones por minuto y por IP de origen** (defensa en
  profundidad: todo el tráfico legítimo viene de la IP del backend, que ya limita por usuario).

**Qué pasa al agotar la cuota**

1. Google responde 429; este servicio responde `429 QUOTA_EXCEEDED` con `Retry-After` (y
   `retryAfterSec`) cuando Google lo indica.
2. El backend entra en **enfriamiento**: no vuelve a llamar a la IA hasta que pase `Retry-After`
   (60 s si no vino), así no consume reintentos inútiles.
3. Mientras tanto **degrada**: `AI_ASSISTED` guarda la propuesta de `BALANCED` marcada como
   `degraded` (la UI lo explica), y `/ai/*` responde `503 AI_UNAVAILABLE` con
   `details.category = QUOTA_EXCEEDED`. Ninguna pantalla se rompe.
4. Cuando la cuota vuelve, la siguiente llamada después del enfriamiento funciona sola.
5. En `smoke:prod` aparece como **WARN** con los segundos de espera.

## 7. Límites de Render (plan gratis)

El servicio duerme tras ~15 minutos sin tráfico y tarda hasta ~1 minuto en despertar: antes de una
demo usa `npm run smoke:prod -- --warm` en el backend (hace ping también a esta IA). Las horas de
instancia del mes se comparten con el backend si están en la misma cuenta.
