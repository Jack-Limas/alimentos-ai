import { SHARED_RULES, type Locale, type VersionedPrompt } from './shared-rules.js';

const TASK = {
  es: [
    'Tarea: escribe el resumen del día del centro de distribución a partir de alertas, pedidos pendientes e indicadores.',
    'summary: 2 frases como máximo sobre el estado general (stock bajo, vencimientos, pedidos que vencen). Copia las cifras de DATA.kpis.',
    'topActions: de 3 a 5 acciones concretas para hoy, de la más urgente a la menos urgente. Empieza cada una con un verbo (Despacha, Revisa, Repone, Dona…) y nombra el producto o el orderCode.',
    'Prioriza alertas CRITICAL antes que WARNING. OPERATOR = tareas de bodega; ADMIN = decisiones de gestión.',
  ].join('\n'),
  en: [
    'Task: write the daily briefing of the distribution center from alerts, pending orders and indicators.',
    'summary: at most 2 sentences on the overall state (low stock, expiring lots, orders coming due). Copy figures from DATA.kpis.',
    'topActions: 3 to 5 concrete actions for today, most urgent first. Start each one with a verb (Ship, Check, Restock, Donate…) and name the product or orderCode.',
    'Put CRITICAL alerts before WARNING ones. OPERATOR = warehouse tasks; ADMIN = management decisions.',
  ].join('\n'),
};

export const BRIEFING_PROMPT: VersionedPrompt = Object.freeze({
  version: 'briefing@2',
  system: (locale: Locale) => `${SHARED_RULES[locale]}\n\n${TASK[locale]}`,
});
