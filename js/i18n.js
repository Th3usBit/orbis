/**
 * Multilingual layer (EN / PT-BR / ES).
 *
 * Two jobs: the static UI strings, and the event titles. The feeds only publish
 * English indicator names, so titles are translated phrase-by-phrase — longest
 * match first, falling back to the original. A partial translation beats a
 * wrong one, so anything unknown is left untouched.
 *
 * Adding a language means three things: a block in UI, a phrase table in
 * PHRASES, and a name_xx column in data/countries.json. Everything else —
 * date formats, the document title, the flag in the switcher — follows.
 */

export const LANGS = ['en', 'pt', 'es'];

/** What goes in <html lang>, and what Intl formats against. */
const HTML_LANG = { en: 'en', pt: 'pt-BR', es: 'es' };
const LOCALES = { en: 'en-GB', pt: 'pt-BR', es: 'es-ES' };

const UI = {
  en: {
    doc_title: 'orbis — the world economic calendar on a globe',
    tagline: 'the world economic calendar',
    boot: 'Assembling the globe…',
    boot_failed: 'Could not load the calendar data. Run the collector first:\npython scripts/fetch.py',
    next_high: 'Next high-impact release',
    impact: 'Impact',
    region: 'Region',
    category: 'Category',
    sources: 'Sources',
    clear: 'clear',
    today: 'today',
    hint: 'Drag to rotate · scroll to zoom · click a marker',

    aria_globe: 'Interactive 3D globe of world economic events',
    aria_lang: 'Language',
    aria_prev_day: 'Previous day',
    aria_next_day: 'Next day',

    impact_3: 'High',
    impact_2: 'Medium',
    impact_1: 'Low',
    impact_0: 'Holiday',

    region_americas: 'Americas',
    region_europe: 'Europe',
    region_asiapac: 'Asia-Pacific',
    region_mea: 'Middle East & Africa',

    cat_rates: 'Monetary policy',
    cat_inflation: 'Inflation',
    cat_growth: 'Growth',
    cat_labor: 'Labour',
    cat_trade: 'Trade',
    cat_housing: 'Housing',
    cat_sentiment: 'Sentiment',
    cat_fiscal: 'Fiscal',
    cat_energy: 'Energy',
    cat_bonds: 'Bonds',
    cat_money: 'Money supply',
    cat_speech: 'Speeches',
    cat_holiday: 'Holidays',
    cat_other: 'Other',

    all_events: 'All events',
    events_n: 'event',
    events_n_plural: 'events',
    no_events: 'No events match the current filters.',
    no_events_hint: 'Try enabling more impact levels or regions.',
    all_day: 'all day',

    actual: 'Actual',
    forecast: 'Forecast',
    previous: 'Previous',
    surprise: 'Surprise vs forecast',
    beat: 'above forecast',
    miss: 'below forecast',
    inline: 'in line with forecast',
    pending: 'awaiting release',

    source: 'Source',
    issuer: 'Released by',
    period: 'Period',
    confirmed: 'confirmed by 2 sources',
    released: 'released',
    generated: 'Data built',
    updated_ago: 'updated {n} ago',

    live_now: 'RELEASING',
    no_upcoming: 'Nothing high-impact scheduled',
    minutes_short: 'm',
  },

  pt: {
    doc_title: 'orbis — o calendário econômico mundial num globo',
    tagline: 'o calendário econômico mundial',
    boot: 'Montando o globo…',
    boot_failed: 'Não foi possível carregar os dados. Rode o coletor primeiro:\npython scripts/fetch.py',
    next_high: 'Próximo evento de alto impacto',
    impact: 'Impacto',
    region: 'Região',
    category: 'Categoria',
    sources: 'Fontes',
    clear: 'limpar',
    today: 'hoje',
    hint: 'Arraste para girar · role para aproximar · clique num marcador',

    aria_globe: 'Globo 3D interativo dos eventos econômicos mundiais',
    aria_lang: 'Idioma',
    aria_prev_day: 'Dia anterior',
    aria_next_day: 'Próximo dia',

    impact_3: 'Alto',
    impact_2: 'Médio',
    impact_1: 'Baixo',
    impact_0: 'Feriado',

    region_americas: 'Américas',
    region_europe: 'Europa',
    region_asiapac: 'Ásia-Pacífico',
    region_mea: 'Oriente Médio e África',

    cat_rates: 'Política monetária',
    cat_inflation: 'Inflação',
    cat_growth: 'Atividade',
    cat_labor: 'Trabalho',
    cat_trade: 'Comércio',
    cat_housing: 'Imobiliário',
    cat_sentiment: 'Confiança',
    cat_fiscal: 'Fiscal',
    cat_energy: 'Energia',
    cat_bonds: 'Títulos',
    cat_money: 'Agregados monetários',
    cat_speech: 'Discursos',
    cat_holiday: 'Feriados',
    cat_other: 'Outros',

    all_events: 'Todos os eventos',
    events_n: 'evento',
    events_n_plural: 'eventos',
    no_events: 'Nenhum evento corresponde aos filtros.',
    no_events_hint: 'Tente habilitar mais níveis de impacto ou regiões.',
    all_day: 'dia todo',

    actual: 'Efetivo',
    forecast: 'Projeção',
    previous: 'Anterior',
    surprise: 'Surpresa vs projeção',
    beat: 'acima da projeção',
    miss: 'abaixo da projeção',
    inline: 'em linha com a projeção',
    pending: 'aguardando divulgação',

    source: 'Fonte',
    issuer: 'Divulgado por',
    period: 'Período',
    confirmed: 'confirmado por 2 fontes',
    released: 'divulgado',
    generated: 'Dados gerados',
    updated_ago: 'atualizado há {n}',

    live_now: 'DIVULGANDO',
    no_upcoming: 'Nenhum evento de alto impacto agendado',
    minutes_short: 'min',
  },

  es: {
    doc_title: 'orbis — el calendario económico mundial en un globo',
    tagline: 'el calendario económico mundial',
    boot: 'Montando el globo…',
    boot_failed: 'No se pudieron cargar los datos. Ejecuta primero el recolector:\npython scripts/fetch.py',
    next_high: 'Próxima publicación de alto impacto',
    impact: 'Impacto',
    region: 'Región',
    category: 'Categoría',
    sources: 'Fuentes',
    clear: 'limpiar',
    today: 'hoy',
    hint: 'Arrastra para girar · desplaza para acercar · haz clic en un marcador',

    aria_globe: 'Globo 3D interactivo de los eventos económicos mundiales',
    aria_lang: 'Idioma',
    aria_prev_day: 'Día anterior',
    aria_next_day: 'Día siguiente',

    impact_3: 'Alto',
    impact_2: 'Medio',
    impact_1: 'Bajo',
    impact_0: 'Festivo',

    region_americas: 'América',
    region_europe: 'Europa',
    region_asiapac: 'Asia-Pacífico',
    region_mea: 'Oriente Medio y África',

    cat_rates: 'Política monetaria',
    cat_inflation: 'Inflación',
    cat_growth: 'Actividad',
    cat_labor: 'Empleo',
    cat_trade: 'Comercio',
    cat_housing: 'Vivienda',
    cat_sentiment: 'Confianza',
    cat_fiscal: 'Fiscal',
    cat_energy: 'Energía',
    cat_bonds: 'Deuda pública',
    cat_money: 'Agregados monetarios',
    cat_speech: 'Discursos',
    cat_holiday: 'Festivos',
    cat_other: 'Otros',

    all_events: 'Todos los eventos',
    events_n: 'evento',
    events_n_plural: 'eventos',
    no_events: 'Ningún evento coincide con los filtros.',
    no_events_hint: 'Prueba a habilitar más niveles de impacto o regiones.',
    all_day: 'todo el día',

    actual: 'Efectivo',
    forecast: 'Previsión',
    previous: 'Anterior',
    surprise: 'Sorpresa vs previsión',
    beat: 'por encima de la previsión',
    miss: 'por debajo de la previsión',
    inline: 'en línea con la previsión',
    pending: 'a la espera de publicación',

    source: 'Fuente',
    issuer: 'Publicado por',
    period: 'Periodo',
    confirmed: 'confirmado por 2 fuentes',
    released: 'publicado',
    generated: 'Datos generados',
    updated_ago: 'actualizado hace {n}',

    live_now: 'PUBLICANDO',
    no_upcoming: 'Nada de alto impacto programado',
    minutes_short: 'min',
  },
};

/**
 * Indicator phrases, longest first so "Core Inflation Rate" wins over
 * "Inflation Rate". Applied as a sequential replace over the English title.
 * English needs no table — it is what the feeds already publish.
 */
const PHRASES = {
  pt: [
    ['Continuing Jobless Claims', 'Seguro-desemprego (continuados)'],
    ['Initial Jobless Claims', 'Pedidos de seguro-desemprego'],
    ['Non Farm Payrolls', 'Payroll (emprego não-agrícola)'],
    ['Nonfarm Payrolls', 'Payroll (emprego não-agrícola)'],
    ['Core PCE Price Index', 'Núcleo do índice de preços PCE'],
    ['PCE Price Index', 'Índice de preços PCE'],
    ['Core Inflation Rate', 'Núcleo da inflação'],
    ['Core Consumer Prices', 'Núcleo dos preços ao consumidor'],
    ['Core Producer Prices', 'Núcleo dos preços ao produtor'],
    ['Consumer Price Index', 'Índice de preços ao consumidor'],
    ['Producer Price Index', 'Índice de preços ao produtor'],
    ['Interest Rate Decision', 'Decisão de juros'],
    ['Interest Rate Projection', 'Projeção de juros'],
    ['Monetary Policy Statement', 'Comunicado de política monetária'],
    ['Monetary Policy Meeting', 'Reunião de política monetária'],
    ['Monetary Policy', 'Política monetária'],
    ['GDP Growth Rate', 'Crescimento do PIB'],
    ['GDP Growth Annualized', 'Crescimento do PIB (anualizado)'],
    ['Unemployment Rate', 'Taxa de desemprego'],
    ['Employment Change', 'Variação do emprego'],
    ['Average Earnings', 'Rendimento médio'],
    ['Industrial Production', 'Produção industrial'],
    ['Manufacturing Production', 'Produção da indústria de transformação'],
    ['Manufacturing PMI', 'PMI industrial'],
    ['Services PMI', 'PMI de serviços'],
    ['Composite PMI', 'PMI composto'],
    ['Construction PMI', 'PMI da construção'],
    ['Consumer Confidence', 'Confiança do consumidor'],
    ['Business Confidence', 'Confiança empresarial'],
    ['Economic Sentiment', 'Sentimento econômico'],
    ['Balance of Trade', 'Balança comercial'],
    ['Current Account', 'Conta corrente'],
    ['Retail Sales', 'Vendas no varejo'],
    ['Building Permits', 'Alvarás de construção'],
    ['Housing Starts', 'Início de construções'],
    ['New Home Sales', 'Vendas de casas novas'],
    ['Existing Home Sales', 'Vendas de casas usadas'],
    ['Durable Goods Orders', 'Pedidos de bens duráveis'],
    ['Factory Orders', 'Pedidos à indústria'],
    ['Capacity Utilization', 'Utilização da capacidade'],
    ['Foreign Exchange Reserves', 'Reservas cambiais'],
    ['Foreign Currency Reserves', 'Reservas cambiais'],
    ['Crude Oil Inventories', 'Estoques de petróleo'],
    ['Crude Oil Stocks Change', 'Variação dos estoques de petróleo'],
    ['Natural Gas Stocks', 'Estoques de gás natural'],
    ['Government Budget', 'Orçamento do governo'],
    ['Inflation Rate', 'Taxa de inflação'],
    ['Inflation Expectations', 'Expectativas de inflação'],
    ['Consumer Prices', 'Preços ao consumidor'],
    ['Producer Prices', 'Preços ao produtor'],
    ['Money Supply', 'Oferta monetária'],
    ['Loan Growth', 'Crescimento do crédito'],
    ['Business Inventories', 'Estoques empresariais'],
    ['Wage Growth', 'Crescimento salarial'],
    ['Press Conference', 'Coletiva de imprensa'],
    ['Bond Auction', 'Leilão de títulos'],
    ['Bill Auction', 'Leilão de letras'],
    ['Trade Balance', 'Balança comercial'],
    ['Exports', 'Exportações'],
    ['Imports', 'Importações'],
    ['Minutes', 'Ata'],
    ['Speech', 'Discurso'],
    ['speaks', 'discursa'],
    ['Testimony', 'Depoimento'],
    ['Auction', 'Leilão'],
    ['Holiday', 'Feriado'],
    ['Growth Rate', 'Taxa de crescimento'],
    ['Confidence', 'Confiança'],
    ['Sentiment', 'Sentimento'],
    ['Payrolls', 'Folha de pagamentos'],
    ['Mortgage', 'Hipotecas'],
    ['Vehicle Sales', 'Vendas de veículos'],
    ['Car Registrations', 'Emplacamentos'],
    ['Tourist Arrivals', 'Chegada de turistas'],
    ['YoY', '(anual)'],
    ['MoM', '(mensal)'],
    ['QoQ', '(trimestral)'],
    ['WoW', '(semanal)'],
    ['Final', 'final'],
    ['Flash', 'prévia'],
    ['Prel', 'prévia'],
    ['Adv', 'prévia'],
  ],

  es: [
    ['Continuing Jobless Claims', 'Solicitudes continuas de subsidio por desempleo'],
    ['Initial Jobless Claims', 'Peticiones iniciales de subsidio por desempleo'],
    ['Non Farm Payrolls', 'Nóminas no agrícolas'],
    ['Nonfarm Payrolls', 'Nóminas no agrícolas'],
    ['Core PCE Price Index', 'Índice de precios PCE subyacente'],
    ['PCE Price Index', 'Índice de precios PCE'],
    ['Core Inflation Rate', 'Tasa de inflación subyacente'],
    ['Core Consumer Prices', 'Precios al consumo subyacentes'],
    ['Core Producer Prices', 'Precios al productor subyacentes'],
    ['Consumer Price Index', 'Índice de precios al consumo'],
    ['Producer Price Index', 'Índice de precios al productor'],
    ['Interest Rate Decision', 'Decisión de tipos de interés'],
    ['Interest Rate Projection', 'Proyección de tipos de interés'],
    ['Monetary Policy Statement', 'Comunicado de política monetaria'],
    ['Monetary Policy Meeting', 'Reunión de política monetaria'],
    ['Monetary Policy', 'Política monetaria'],
    ['GDP Growth Rate', 'Crecimiento del PIB'],
    ['GDP Growth Annualized', 'Crecimiento del PIB (anualizado)'],
    ['Unemployment Rate', 'Tasa de desempleo'],
    ['Employment Change', 'Variación del empleo'],
    ['Average Earnings', 'Salario medio'],
    ['Industrial Production', 'Producción industrial'],
    ['Manufacturing Production', 'Producción manufacturera'],
    ['Manufacturing PMI', 'PMI manufacturero'],
    ['Services PMI', 'PMI de servicios'],
    ['Composite PMI', 'PMI compuesto'],
    ['Construction PMI', 'PMI de construcción'],
    ['Consumer Confidence', 'Confianza del consumidor'],
    ['Business Confidence', 'Confianza empresarial'],
    ['Economic Sentiment', 'Sentimiento económico'],
    ['Balance of Trade', 'Balanza comercial'],
    ['Current Account', 'Cuenta corriente'],
    ['Retail Sales', 'Ventas minoristas'],
    ['Building Permits', 'Permisos de construcción'],
    ['Housing Starts', 'Viviendas iniciadas'],
    ['New Home Sales', 'Ventas de viviendas nuevas'],
    ['Existing Home Sales', 'Ventas de viviendas usadas'],
    ['Durable Goods Orders', 'Pedidos de bienes duraderos'],
    ['Factory Orders', 'Pedidos de fábrica'],
    ['Capacity Utilization', 'Utilización de la capacidad'],
    ['Foreign Exchange Reserves', 'Reservas de divisas'],
    ['Foreign Currency Reserves', 'Reservas de divisas'],
    ['Crude Oil Inventories', 'Inventarios de crudo'],
    ['Crude Oil Stocks Change', 'Variación de inventarios de crudo'],
    ['Natural Gas Stocks', 'Inventarios de gas natural'],
    ['Government Budget', 'Presupuesto del Estado'],
    ['Inflation Rate', 'Tasa de inflación'],
    ['Inflation Expectations', 'Expectativas de inflación'],
    ['Consumer Prices', 'Precios al consumo'],
    ['Producer Prices', 'Precios al productor'],
    ['Money Supply', 'Oferta monetaria'],
    ['Loan Growth', 'Crecimiento del crédito'],
    ['Business Inventories', 'Inventarios empresariales'],
    ['Wage Growth', 'Crecimiento salarial'],
    ['Press Conference', 'Rueda de prensa'],
    ['Bond Auction', 'Subasta de bonos'],
    ['Bill Auction', 'Subasta de letras'],
    ['Trade Balance', 'Balanza comercial'],
    ['Exports', 'Exportaciones'],
    ['Imports', 'Importaciones'],
    ['Minutes', 'Actas'],
    ['Speech', 'Discurso'],
    ['speaks', 'interviene'],
    ['Testimony', 'Comparecencia'],
    ['Auction', 'Subasta'],
    ['Holiday', 'Festivo'],
    ['Growth Rate', 'Tasa de crecimiento'],
    ['Confidence', 'Confianza'],
    ['Sentiment', 'Sentimiento'],
    ['Payrolls', 'Nóminas'],
    ['Mortgage', 'Hipotecas'],
    ['Vehicle Sales', 'Ventas de vehículos'],
    ['Car Registrations', 'Matriculaciones'],
    ['Tourist Arrivals', 'Llegadas de turistas'],
    ['YoY', '(interanual)'],
    ['MoM', '(mensual)'],
    ['QoQ', '(trimestral)'],
    ['WoW', '(semanal)'],
    ['Final', 'final'],
    ['Flash', 'preliminar'],
    ['Prel', 'preliminar'],
    ['Adv', 'preliminar'],
  ],
};

let current = 'en';

export function getLang() {
  return current;
}

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : 'en';
  document.documentElement.lang = HTML_LANG[current];
  document.documentElement.dataset.lang = current;
  try {
    localStorage.setItem('orbis.lang', current);
  } catch { /* private browsing: the toggle still works for this session */ }
  return current;
}

export function initLang() {
  let stored = null;
  try {
    stored = localStorage.getItem('orbis.lang');
  } catch { /* ignore */ }
  return setLang(stored || guessLang());
}

/** The first browser preference we actually speak, else English. */
function guessLang() {
  const preferences = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || 'en'];

  for (const preference of preferences) {
    const base = preference.toLowerCase().split('-')[0];
    if (LANGS.includes(base)) return base;
  }
  return 'en';
}

/** Translate a UI key, with optional {placeholder} substitution. */
export function t(key, vars) {
  let value = UI[current][key] ?? UI.en[key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, replacement);
    }
  }
  return value;
}

/** Plural-aware "12 events". */
export function tCount(n) {
  return `${n} ${t(n === 1 ? 'events_n' : 'events_n_plural')}`;
}

export function categoryLabel(category) {
  return t(`cat_${category}`) === `cat_${category}` ? category : t(`cat_${category}`);
}

export function impactLabel(impact) {
  return t(`impact_${impact}`);
}

export function regionLabel(region) {
  return t(`region_${region}`);
}

/** Translate an English indicator title into the active language. */
export function eventTitle(title) {
  const phrases = PHRASES[current];
  if (!phrases || !title) return title;

  let output = title;
  for (const [english, translated] of phrases) {
    if (output.includes(english)) {
      output = output.split(english).join(translated);
    }
  }
  return output;
}

/** Country name in the active language, falling back to English. */
export function countryName(country) {
  if (!country) return '';
  return country[`name_${current}`] || country.name_en;
}

/**
 * Paint every [data-i18n] node. Called on load and on every language switch.
 * [data-i18n-aria] does the same for the labels only screen readers hear.
 */
export function applyStaticStrings(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }
}

export function locale() {
  return LOCALES[current];
}
