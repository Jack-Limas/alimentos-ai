import { SHARED_RULES, type Locale, type VersionedPrompt } from './shared-rules.js';

const TASK = {
  es: [
    'Tarea: explica una propuesta de distribución que ya calculó el sistema de reglas.',
    'Las cantidades recomendadas, los puntajes y el orden ya están decididos: tú solo los explicas, no los cambias.',
    'summary: 1 o 2 frases sobre qué se atiende primero y por qué (prioridad, fecha de entrega, vencimiento).',
    'highlights: de 2 a 5 frases con lo más importante para quien prepara los pedidos (stock parcial, sin stock, lotes por vencer). Menciona pedidos por su orderCode.',
    'DATA no trae unidades de medida: escribe las cantidades sin unidad, por ejemplo "40 de Leche entera en bolsa" o "cantidad 40".',
    'Conteos: si dices cuántos pedidos o líneas hay, o cuántos pedidos se atienden completos, parciales o sin stock, copia el número de DATA.totals (orders, lines, full, partial, unserved). No cuentes tú.',
    'Puntajes: puedes redondearlos a entero (98,33 → 98).',
    'tieBreakOrder: solo si en DATA.ties hay pedidos empatados, devuelve sus orderCode en el orden que recomiendas, usando únicamente esos códigos. Si no hay empates, devuelve una lista vacía.',
    'Adapta el tono al rol: OPERATOR = instrucciones de bodega; ADMIN = visión de gestión.',
  ].join('\n'),
  en: [
    'Task: explain a distribution proposal that the rules engine already computed.',
    'Recommended quantities, scores and order are already decided: you only explain them, you do not change them.',
    'summary: 1 or 2 sentences on what is served first and why (priority, due date, expiry).',
    'highlights: 2 to 5 sentences with what matters most to whoever prepares the orders (partial stock, no stock, lots about to expire). Refer to orders by their orderCode.',
    'DATA has no units of measure: write quantities without a unit, for example "40 of Whole milk" or "quantity 40".',
    'Counts: if you say how many orders or lines there are, or how many orders are served in full, partially or not at all, copy the number from DATA.totals (orders, lines, full, partial, unserved). Never count yourself.',
    'Scores: you may round them to whole numbers (98.33 → 98).',
    'tieBreakOrder: only if DATA.ties has tied orders, return their orderCode values in the order you recommend, using only those codes. If there are no ties, return an empty list.',
    'Match the tone to the role: OPERATOR = warehouse instructions; ADMIN = management view.',
  ].join('\n'),
};

/** Added when DATA was trimmed after an answer cut by the token limit. */
const COMPACT = {
  es: 'DATA.lines trae solo las líneas de mayor puntaje; los totales de toda la propuesta están en DATA.totals. summary: 1 frase. highlights: como máximo 3 frases cortas.',
  en: 'DATA.lines only has the highest-scoring lines; the totals of the whole proposal are in DATA.totals. summary: 1 sentence. highlights: at most 3 short sentences.',
};

export const PROPOSAL_EXPLANATION_PROMPT: VersionedPrompt = Object.freeze({
  version: 'proposal-explanation@3',
  system: (locale: Locale, options?: { compact?: boolean }) =>
    `${SHARED_RULES[locale]}\n\n${TASK[locale]}${options?.compact ? `\n${COMPACT[locale]}` : ''}`,
});
