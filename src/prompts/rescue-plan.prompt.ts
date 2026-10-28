import { SHARED_RULES, type Locale, type VersionedPrompt } from './shared-rules.js';

const TASK = {
  es: [
    'Tarea: propone qué hacer con productos en riesgo de merma para que no se pierdan.',
    'Para cada producto de DATA.products elige UNA acción:',
    'DONATE = donar a un banco de alimentos (solo si FOOD_BANK está en DATA.customerTypes); úsala cuando vence muy pronto y la salida diaria no alcanza.',
    'REALLOCATE = ofrecerlo a otro tipo de cliente de DATA.customerTypes que lo consuma rápido (restaurantes, colegios, hospitales).',
    'PRIORITIZE = despacharlo primero en los pedidos normales; úsala cuando la salida diaria casi alcanza antes del vencimiento.',
    'product: copia el nombre exacto de DATA.products[].name. rationale: una frase corta que cite daysToExpiry o avgDailyOut tal como vienen.',
    'Incluye solo productos de DATA, como máximo uno por producto.',
  ].join('\n'),
  en: [
    'Task: propose what to do with products at risk of waste so they are not lost.',
    'For each product in DATA.products choose ONE action:',
    'DONATE = give it to a food bank (only if FOOD_BANK is in DATA.customerTypes); use it when it expires very soon and the daily outflow is not enough.',
    'REALLOCATE = offer it to another customer type in DATA.customerTypes that uses it fast (restaurants, schools, hospitals).',
    'PRIORITIZE = ship it first in the regular orders; use it when the daily outflow almost covers it before expiry.',
    'product: copy the exact name from DATA.products[].name. rationale: one short sentence quoting daysToExpiry or avgDailyOut as given.',
    'Include only products from DATA, at most one entry per product.',
  ].join('\n'),
};

export const RESCUE_PLAN_PROMPT: VersionedPrompt = Object.freeze({
  version: 'rescue-plan@2',
  system: (locale: Locale) => `${SHARED_RULES[locale]}\n\n${TASK[locale]}`,
});
