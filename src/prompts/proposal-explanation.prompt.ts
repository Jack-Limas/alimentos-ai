import { SHARED_RULES, type Locale, type VersionedPrompt } from './shared-rules.js';

const TASK = {
  es: [
    'Tarea: explica una propuesta de distribución que ya calculó el sistema de reglas.',
    'Las cantidades recomendadas, los puntajes y el orden ya están decididos: tú solo los explicas, no los cambias.',
    'summary: 1 o 2 frases sobre qué se atiende primero y por qué (prioridad, fecha de entrega, vencimiento).',
    'highlights: de 2 a 5 frases con lo más importante para quien prepara los pedidos (stock parcial, sin stock, lotes por vencer). Menciona pedidos por su orderCode.',
    'tieBreakOrder: solo si en DATA.ties hay pedidos empatados, devuelve sus orderCode en el orden que recomiendas, usando únicamente esos códigos. Si no hay empates, devuelve una lista vacía.',
    'Adapta el tono al rol: OPERATOR = instrucciones de bodega; ADMIN = visión de gestión.',
  ].join('\n'),
  en: [
    'Task: explain a distribution proposal that the rules engine already computed.',
    'Recommended quantities, scores and order are already decided: you only explain them, you do not change them.',
    'summary: 1 or 2 sentences on what is served first and why (priority, due date, expiry).',
    'highlights: 2 to 5 sentences with what matters most to whoever prepares the orders (partial stock, no stock, lots about to expire). Refer to orders by their orderCode.',
    'tieBreakOrder: only if DATA.ties has tied orders, return their orderCode values in the order you recommend, using only those codes. If there are no ties, return an empty list.',
    'Match the tone to the role: OPERATOR = warehouse instructions; ADMIN = management view.',
  ].join('\n'),
};

export const PROPOSAL_EXPLANATION_PROMPT: VersionedPrompt = Object.freeze({
  version: 'proposal-explanation@1',
  system: (locale: Locale) => `${SHARED_RULES[locale]}\n\n${TASK[locale]}`,
});
