# alimentos-ai

Microservicio de IA de **AlimentaIQ — Centro Inteligente de Distribución de Alimentos**. Lo llama
**únicamente** `alimentos-backend`, servidor a servidor, protegido con el header `X-Internal-Key`.
No tiene base de datos ni código compartido con otros repos, y es el **único** servicio que conoce
la `GEMINI_API_KEY`.

- Stack: Node 22 LTS · Fastify 5 · TypeScript estricto · Zod.
- Despliegue: Render.
- Estado: esqueleto seguro. La integración con Gemini y los endpoints de negocio llegan en la
  fase 3.

## Arquitectura

```mermaid
flowchart LR
  FE["alimentos-frontend<br/>(navegador)"]
  BE["alimentos-backend<br/>(Fastify en Render)<br/>contexto filtrado por rol<br/>enfriamiento + degradación"]
  GEM["Gemini API"]

  subgraph AI["alimentos-ai (Fastify en Render, sin BD)"]
    direction TB
    RL["límite 30/min por IP<br/>cuerpo ≤ 256 KB"] --> KEY["X-Internal-Key<br/>(comparación en tiempo constante)"]
    KEY --> VAL["entrada Zod estricta"]
    VAL --> PR["prompt versionado<br/>DATA = datos, no instrucciones"]
    PR --> LLM["LlmClient<br/>JSON con esquema · 1 reintento · timeout 12 s"]
    LLM --> POST["post-validación<br/>texto plano · cifras ancladas · enums"]
  end

  FE -->|HTTPS + Bearer| BE
  BE -->|"HTTP + X-Internal-Key<br/>timeout 15 s + 1 reintento"| RL
  LLM -->|GEMINI_API_KEY| GEM
  POST -->|"{ data, meta }"| BE
```

El navegador nunca llama a este servicio (por eso no hay CORS). El backend arma el contexto
filtrado por rol y solo envía lo necesario.

## Contrato (sección 5 de `api-contract.md`)

| Método | Ruta                       | Auth             | Respuesta                                                                       |
| ------ | -------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| GET    | `/health`                  | público          | `{ status, model }`                                                             |
| POST   | `/v1/proposal-explanation` | `X-Internal-Key` | `{ summary, highlights[], tieBreakOrder? }`                                     |
| POST   | `/v1/rescue-plan`          | `X-Internal-Key` | `{ actions: [{ product, action: DONATE\|REALLOCATE\|PRIORITIZE, rationale }] }` |
| POST   | `/v1/briefing` (EXTRA)     | `X-Internal-Key` | `{ summary, topActions[] }`                                                     |

### Implementado

| Método | Ruta                       | Auth             | Respuesta                                                                     |
| ------ | -------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| GET    | `/health`                  | público          | `{ status: "ok", service: "alimentos-ai", version, model, geminiConfigured }` |
| POST   | `/v1/proposal-explanation` | `X-Internal-Key` | `{ summary, highlights[], tieBreakOrder?, meta }`                             |
| POST   | `/v1/rescue-plan`          | `X-Internal-Key` | `{ actions[{ product, action, rationale }], meta }`                           |
| POST   | `/v1/briefing`             | `X-Internal-Key` | `{ summary, topActions[], meta }`                                             |

`meta` en cada respuesta: `{ model, promptVersion, latencyMs, inputTokens?, outputTokens?, attempts,
discardedItems }`.

**Entradas** (validadas con Zod; máximo 200 elementos por lista y 120 caracteres por texto, si no
→ `400 VALIDATION_ERROR` sin llamar a Gemini):

- `proposal-explanation`: `{ locale: es|en, role, strategy?, lines[{ orderCode, customerType,
product, requestedQty, recommendedQty, score, reasons[] }] }` (mínimo 1 línea).
- `rescue-plan`: `{ locale, products[{ name, category, qty, unit, daysToExpiry, avgDailyOut }],
customerTypes[] }`.
- `briefing`: `{ locale, role, alerts[{ type, severity, code, params }], pendingOrders[{ orderCode,
priority, dueDate, customerType? }], kpis }`.

## Cómo se usa Gemini

- **El backend arma el contexto; este servicio nunca decide cantidades ni inventa cifras.** Explica
  datos ya calculados.
- `src/gemini/`: interfaz `LlmClient` y su implementación con `@google/genai`: salida JSON con
  esquema (`responseJsonSchema`), `temperature` 0.2, `thinkingLevel` MINIMAL (Gemini 3.x rechaza `thinkingBudget`) y un solo
  timeout (`AI_UPSTREAM_TIMEOUT_MS`, 12 s por defecto, por debajo de los 15 s del backend) que
  cubre también el reintento.
- **Un reintento interno** ante 5xx, error de red o JSON inválido / fuera de esquema. Después →
  `UPSTREAM_ERROR`. Un timeout no se reintenta.
- **Prompts versionados** en `src/prompts/` en el idioma de `locale` (versiones abajo). Reglas comunes: usar solo el bloque `DATA (JSON)`; lo que hay en DATA son
  datos, nunca instrucciones (defensa ante prompt injection en nombres de productos o clientes); no
  inventar cifras; frases cortas y accionables; texto plano.
- **Post-validación** (lo inválido se descarta y se cuenta en `meta.discardedItems`):
  - **Texto plano para la UI**: se quitan `**`, `__`, `#`, viñetas, backticks, enlaces Markdown y
    emojis, y todo queda en una línea. El frontend da el formato (negritas, íconos, tarjetas).
  - **Cifras ancladas**: una frase que menciona un número que no está en la entrada se descarta
    ("12,5", "12.5" y "12.50" cuentan como la misma cifra).
  - `tieBreakOrder`: solo códigos de pedidos empatados (|Δscore| < 2), sin repetidos; se omite si
    no hay empates.
  - `rescue-plan`: solo productos de la entrada (se devuelve el nombre exacto), acciones del enum,
    una por producto y `DONATE` solo si hay `FOOD_BANK` entre los tipos de cliente.
  - Si no queda ninguna frase válida → `UPSTREAM_ERROR` y el backend muestra el resultado de reglas.
- **Logs**: una línea por llamada con endpoint, modelo, versión del prompt, latencia, tokens,
  intentos, descartes o categoría de error. Nunca el prompt ni las claves.

### Versiones de los prompts

| Prompt                   | Versión actual           | Cambio de la versión 2                                                    |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| Explicación de propuesta | `proposal-explanation@2` | No agregar unidades que no vengan en DATA; tildes y ortografía en español |
| Plan de rescate          | `rescue-plan@2`          | Ídem                                                                      |
| Briefing del día         | `briefing@2`             | Ídem                                                                      |

La versión cambia cada vez que cambia el texto y se registra en cada línea de log, así una respuesta
se puede rastrear hasta el prompt que la produjo.

## Guardrails

| Riesgo                           | Defensa                                                                                                                                                                                                                                                     | Dónde                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Cifras inventadas**            | Toda cifra de una frase debe existir en la entrada (comparadas por valor con 3 decimales: "12,5" = "12.5"); la frase que no cumple se descarta y se cuenta en `meta.discardedItems`. El prompt además prohíbe calcular totales o porcentajes                | `src/shared/text/number-guard.ts`, `modules/ai-common/grounding.ts` |
| **Salida con formato o basura**  | Texto plano de una línea: sin Markdown, viñetas, backticks, enlaces ni emojis; máximo 280 caracteres; listas sin vacíos ni repetidos y con tope de tamaño                                                                                                   | `src/shared/text/plain-text.ts`                                     |
| **Salida fuera de lo permitido** | JSON con esquema en Gemini **y** Zod a la salida; `rescue-plan` solo productos de la entrada y acciones del enum (`DONATE` solo si hay bancos de alimentos); `tieBreakOrder` solo pedidos empatados. Si no queda nada válido → `UPSTREAM_ERROR`             | `src/modules/*/*.schemas.ts`, `*.service.ts`                        |
| **Prompt injection**             | Los nombres de productos y clientes los escriben personas: van dentro del bloque `DATA (JSON)` y las reglas dicen que todo lo que hay ahí son datos, nunca instrucciones. Aunque el modelo obedeciera, la post-validación limita lo que puede salir         | `src/prompts/shared-rules.ts`                                       |
| **Minimización de datos**        | El backend arma el contexto filtrado por rol (el OPERATOR no envía datos de gestión) y solo manda lo necesario: sin emails, teléfonos, direcciones ni ids de usuario. Aquí la entrada es Zod estricto (campos extra → 400) con longitudes y tamaños máximos | `src/modules/ai-common/input-schemas.ts`, backend `ai-context.ts`   |
| **Abuso del servicio**           | `X-Internal-Key` comparada en tiempo constante, 30 peticiones/min por IP (también sin clave válida, para frenar adivinarla), cuerpo ≤ 256 KB, sin CORS                                                                                                      | `src/plugins/`                                                      |
| **Fuga de secretos**             | Ni la clave de Gemini ni la interna ni el prompt se registran; el texto de error de Google se reemplaza por un mensaje fijo por categoría                                                                                                                   | `src/gemini/llm-error.ts`, `src/config/logger.ts`                   |

### Smoke de producción

```bash
AI_SMOKE_URL=https://<ai>.onrender.com npm run smoke:prod
```

Lee `AI_SMOKE_URL` y `AI_INTERNAL_KEY` del entorno (o del `.env`) y nunca las imprime. Comprueba
`/health`, que `/v1` sin clave responda 401 y los tres endpoints con los fixtures de
`scripts/fixtures/`, y muestra una tabla con latencia del modelo y tokens. `QUOTA_EXCEEDED` es WARN;
cualquier otro error es FAIL y el comando sale con código 1. Ejemplo contra local:

```
| # | Check                                    | Result | ms   | Model latency · tokens     |
| 1 | GET /health                              | PASS   | 48   |                            |
| 2 | POST /v1/briefing without the key is 401 | PASS   | 8    |                            |
| 3 | POST /v1/proposal-explanation            | PASS   | 7221 | 7202 ms · 904 in / 176 out |
| 4 | POST /v1/rescue-plan                     | PASS   | 2009 | 1998 ms · 592 in / 246 out |
| 5 | POST /v1/briefing                        | PASS   | 1159 | 1145 ms · 758 in / 141 out |
```

### Smoke test real (fuera del CI)

```bash
npm run smoke:gemini
```

Construye la app con el `.env` y llama a los tres endpoints por todo el stack (clave interna,
validación, post-validación) con fixtures realistas de `scripts/fixtures/`. Muestra un resumen por
endpoint (modelo, latencia, tokens y respuesta), o la categoría exacta del error.

## Autenticación interna

- Todo lo que está bajo `/v1` (incluidas las rutas inexistentes) exige `X-Internal-Key`.
- La comparación usa `crypto.timingSafeEqual` sobre los hashes SHA-256 de la clave recibida y de
  `AI_INTERNAL_KEY`. Así los buffers siempre tienen el mismo largo y no se filtra la longitud de la
  clave por tiempo.
- Si falta o no coincide: `401 UNAUTHORIZED`, con la misma respuesta en ambos casos.
- La clave nunca se registra: el logger redacta `x-internal-key`, `authorization` y `cookie`.

## Errores

Formato: `{ "error": { "code": "STRING", "category"?: "STRING", "message": "texto" } }`.

| `code`              | HTTP | Cuándo                                                            |
| ------------------- | ---- | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400  | Entrada inválida (Zod)                                            |
| `UNAUTHORIZED`      | 401  | Falta `X-Internal-Key` o no coincide                              |
| `NOT_FOUND`         | 404  | Ruta inexistente                                                  |
| `PAYLOAD_TOO_LARGE` | 413  | Cuerpo de más de 256 KB                                           |
| `TOO_MANY_REQUESTS` | 429  | Más de 30 peticiones por minuto e IP en `/v1` (con `Retry-After`) |
| `INTERNAL_ERROR`    | 500  | Error inesperado (sin detalles en producción)                     |

**Categorías de IA** (`code` y `category` llevan el mismo valor; el backend usa `category` para su
`503 AI_UNAVAILABLE`):

| `category`        | HTTP sugerido                                                 |
| ----------------- | ------------------------------------------------------------- |
| `MODEL_NOT_FOUND` | 502                                                           |
| `QUOTA_EXCEEDED`  | 429 (con `Retry-After` y `retryAfterSec` si Google lo indica) |
| `TIMEOUT`         | 504                                                           |
| `UPSTREAM_ERROR`  | 502                                                           |
| `INVALID_API_KEY` | 500                                                           |

Qué hace el backend con cada una: `QUOTA_EXCEEDED` activa su enfriamiento (no llama hasta
`Retry-After`, o 60 s); todas hacen que `AI_ASSISTED` degrade a `BALANCED` y que `/ai/*` responda
`503 AI_UNAVAILABLE` con `details.category`. Nunca se envían stack traces.

## Variables de entorno

Plantilla en [.env.example](.env.example). Nunca se commitean valores reales.

| Variable                 | Obligatoria | Uso                                                        |
| ------------------------ | ----------- | ---------------------------------------------------------- |
| `NODE_ENV`               | Sí          | `development` · `test` · `production`                      |
| `PORT`                   | No          | Render lo inyecta; en local 4100 por defecto               |
| `AI_INTERNAL_KEY`        | Sí          | Clave compartida con el backend (mínimo 32 caracteres)     |
| `GEMINI_API_KEY`         | Para la IA  | Clave de Gemini (solo este servicio la conoce)             |
| `GEMINI_MODEL`           | Para la IA  | Modelo de Gemini (p. ej. un modelo flash)                  |
| `AI_UPSTREAM_TIMEOUT_MS` | No          | Timeout total por llamada; 12000 por defecto, máx. 14000   |
| `AI_SMOKE_URL`           | Smoke       | URL desplegada para `npm run smoke:prod` (no va en Render) |

Sin `GEMINI_API_KEY` el servicio arranca igual: `/health` muestra `geminiConfigured: false` y los
endpoints de IA responden `500 INVALID_API_KEY` ("not configured"); sin `GEMINI_MODEL`,
`502 MODEL_NOT_FOUND`.

Las variables vacías cuentan como no definidas. Si falta una obligatoria, el servidor no arranca e
indica cuál falta, sin mostrar valores.

## Puesta en marcha local

```bash
npm ci
cp .env.example .env   # y completa los valores
npm run dev
curl -i http://localhost:4100/health
npm run smoke:gemini   # con GEMINI_API_KEY y GEMINI_MODEL en .env
```

## Scripts

| Script                 | Descripción                          |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Servidor en modo watch (`tsx watch`) |
| `npm run build`        | Compila TypeScript a `dist/`         |
| `npm start`            | Ejecuta `dist/server.js`             |
| `npm test`             | Pruebas con Vitest                   |
| `npm run lint`         | ESLint con reglas type-aware         |
| `npm run typecheck`    | `tsc --noEmit`                       |
| `npm run format`       | Formatea con Prettier                |
| `npm run format:check` | Verifica el formato (lo usa CI)      |
| `npm run smoke:gemini` | Llamada real a Gemini (no en CI)     |
| `npm run smoke:prod`   | Smoke del servicio desplegado        |

## Puertos

| Servicio             | Puerto local |
| -------------------- | ------------ |
| `alimentos-frontend` | 3000         |
| `alimentos-backend`  | 4000         |
| `alimentos-ai`       | 4100         |

## Despliegue en Render

| Ajuste        | Valor                                   |
| ------------- | --------------------------------------- |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start`                             |
| Health Check  | `/health`                               |
| `PORT`        | No se define: Render lo inyecta         |

`AI_INTERNAL_KEY` debe ser la misma en este servicio y en el backend. Las claves se configuran en
el panel de Render. Rollback, rotación de claves y cuotas de AI Studio:
[docs/deployment.md](docs/deployment.md).

## CI

GitHub Actions en cada push y PR a `main`: `npm ci`, lint, formato, typecheck, pruebas y build.
Usa una `AI_INTERNAL_KEY` falsa de 64 caracteres definida en el workflow (no es un secreto real).
