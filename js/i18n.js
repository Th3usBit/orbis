/**
 * Multilingual layer (EN / PT-BR / ES).
 *
 * Two jobs: the static UI strings, and the event titles. The feeds only publish
 * English indicator names, so titles are translated phrase-by-phrase — longest
 * match first, falling back to the original. A partial translation beats a
 * wrong one, so anything unknown is left untouched.
 *
 * Adding a language means four edits across three files: a block in UI and a
 * phrase table in PHRASES here, a name_xx column in data/countries.json, and a
 * button with its flag in index.html. Everything else — date formats, the
 * document title, the switcher itself — follows.
 */

export const LANGS = ['en', 'pt', 'es'];

/** What goes in <html lang>, and what Intl formats against. */
const HTML_LANG = { en: 'en', pt: 'pt-BR', es: 'es' };
const LOCALES = { en: 'en-GB', pt: 'pt-BR', es: 'es-ES' };

export const UI = {
  en: {
    doc_title: 'orbis — the world economic calendar on a globe',
    tagline: 'the world economic calendar',
    boot: 'Assembling the globe…',
    boot_failed: 'No data yet. orbis ships empty by design — build it once:\n\n  start.bat     (Windows)\n  ./start.sh    (Linux / macOS)',
    next_high: 'Next high-impact release',
    impact: 'Impact',
    region: 'Region',
    category: 'Category',
    sources: 'Sources',
    credits_mid: 'is MIT-licensed. Globe by',
    credits_type: 'type set in',
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
    boot_failed: 'Ainda não há dados. O orbis vem vazio de propósito — gere-os uma vez:\n\n  start.bat     (Windows)\n  ./start.sh    (Linux / macOS)',
    next_high: 'Próximo evento de alto impacto',
    impact: 'Impacto',
    region: 'Região',
    category: 'Categoria',
    sources: 'Fontes',
    credits_mid: 'é software livre (MIT). Globo com',
    credits_type: 'tipografia em',
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
    boot_failed: 'Aún no hay datos. orbis se distribuye vacío a propósito — genéralos una vez:\n\n  start.bat     (Windows)\n  ./start.sh    (Linux / macOS)',
    next_high: 'Próxima publicación de alto impacto',
    impact: 'Impacto',
    region: 'Región',
    category: 'Categoría',
    sources: 'Fuentes',
    credits_mid: 'es software libre (MIT). Globo con',
    credits_type: 'tipografía en',
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
 * Indicator, holiday and period phrases, applied as a sequential replace over
 * the English title. English needs no table — it is what the feeds publish.
 *
 * Grouped by topic rather than by length: eventTitle() sorts by phrase length
 * before applying, so "Core Inflation Rate" still beats "Inflation Rate" and a
 * bare "Change" only ever catches what no compound above it claimed. A new row
 * is therefore safe to drop anywhere in the list.
 */
export const PHRASES = {
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
    // Holiday and observance names - nager publishes these in English only.
    ['New Year\'s Day', 'Ano-Novo'],
    ['New Year\'s Eve', 'Véspera de Ano-Novo'],
    ['Christmas Day', 'Natal'],
    ['Christmas Eve', 'Véspera de Natal'],
    ['Good Friday', 'Sexta-feira Santa'],
    ['Easter Monday', 'Segunda-feira de Páscoa'],
    ['Boxing Day', 'Dia de Santo Estêvão'],
    ['All Saints\' Day', 'Dia de Todos os Santos'],
    ['Assumption of Mary', 'Assunção de Nossa Senhora'],
    ['Immaculate Conception', 'Imaculada Conceição'],
    ['Day of Our Lady of the Seven Sorrows', 'Dia de Nossa Senhora das Sete Dores'],
    ['Feast of Our Lady of', 'Festa de Nossa Senhora de'],
    ['Thanksgiving Day', 'Dia de Ação de Graças'],
    ['Memorial Day', 'Dia da Memória'],
    ['Veterans Day', 'Dia dos Veteranos'],
    ['Columbus Day', 'Dia de Colombo'],
    ['Presidents\' Day', 'Dia dos Presidentes'],
    ['Independence Day', 'Dia da Independência'],
    ['Unification Day', 'Dia da Unificação'],
    ['Labour Day', 'Dia do Trabalho'],
    ['Labor Day', 'Dia do Trabalho'],
    ['National Day Golden Week', 'Semana Dourada (feriado nacional)'],
    ['National Day', 'Feriado nacional'],
    ['National holiday', 'Feriado nacional'],
    ['Mid-Autumn Festival', 'Festival do Meio-Outono'],
    ['Respect for the Aged Day', 'Dia do Respeito aos Idosos'],
    ['Army Day', 'Dia do Exército'],
    ['Rosh Hashanah', 'Rosh Hashaná'],
    ['Father\'s Day', 'Dia dos Pais'],
    ['Mother\'s Day', 'Dia das Mães'],

    // Indicators the feeds publish that the first pass missed.
    ['EIA Distillate Fuel Production Change', 'Variação da produção de destilados (EIA)'],
    ['EIA Refinery Crude Runs Change', 'Processamento de petróleo nas refinarias (EIA)'],
    ['EIA Gasoline Production Change', 'Variação da produção de gasolina (EIA)'],
    ['EIA Heating Oil Stocks Change', 'Variação dos estoques de óleo de aquecimento (EIA)'],
    ['EIA Distillate Stocks Change', 'Variação dos estoques de destilados (EIA)'],
    ['EIA Gasoline Stocks Change', 'Variação dos estoques de gasolina (EIA)'],
    ['API Crude Oil Stock Change', 'Variação dos estoques de petróleo (API)'],
    ['Baker Hughes Total Rigs Count', 'Total de sondas em operação (Baker Hughes)'],
    ['Baker Hughes Oil Rig Count', 'Sondas de petróleo em operação (Baker Hughes)'],
    ['Jobless Claims 4-week Average', 'Média de 4 semanas do seguro-desemprego'],
    ['Participation Rate', 'Taxa de participação'],
    ['Unemployed Persons', 'Número de desempregados'],
    ['BCB Focus Market Readout', 'Boletim Focus (BCB)'],
    ['BoJ JGB Purchase', 'Compra de JGBs (BoJ)'],
    ['Deposit Facility Rate', 'Taxa de depósito'],
    ['Overnight Lending Rate', 'Taxa de empréstimo overnight'],
    ['Fed Balance Sheet', 'Balanço do Fed'],
    ['Budget Balance', 'Resultado orçamentário'],
    ['Treasury Cash Balance', 'Caixa do Tesouro'],
    ['External Debt', 'Dívida externa'],
    ['Foreign Direct Investment', 'Investimento estrangeiro direto'],
    ['Foreign Bond Investment', 'Investimento estrangeiro em títulos'],
    ['Stock Investment by Foreigners', 'Investimento estrangeiro em ações'],
    ['MBA Purchase Index', 'Índice de compras (MBA)'],
    ['Eco Watchers Survey Current', 'Pesquisa Eco Watchers (atual)'],
    ['Eco Watchers Survey Outlook', 'Pesquisa Eco Watchers (perspectiva)'],
    ['NFIB Business Optimism Index', 'Índice de otimismo das pequenas empresas (NFIB)'],
    ['Leading Indicators', 'Indicadores antecedentes'],
    ['Revised GDP', 'PIB revisado'],
    ['Core CPI', 'Núcleo do IPC'],
    ['Core PPI', 'Núcleo do IPP'],
    ['CPI', 'IPC'],
    ['PPI', 'IPP'],
    ['HPI', 'Índice de preços de imóveis'],
    ['BRICS Summit', 'Cúpula do BRICS'],
    ['ECOFIN Meeting', 'Reunião do ECOFIN'],

    // Period suffixes. ForexFactory lowercases what TradingView writes as MoM.
    ['m/m', '(mensal)'],
    ['q/q', '(trimestral)'],
    ['y/y', '(anual)'],
    ['w/w', '(semanal)'],

    // Last resort: a bare Change, after every compound above has had its turn.
    ['Consumer Confidence Change', 'Variação da confiança do consumidor'],
    ['Consumer Credit Change', 'Variação do crédito ao consumidor'],
    ['Unemployment Change', 'Variação do desemprego'],
    ['Production Change', 'Variação da produção'],
    ['Stocks Change', 'Variação dos estoques'],
    ['Stock Change', 'Variação dos estoques'],
    ['Change', 'Variação'],

    // Hyphenated compounds: one word, not two.
    ['T-Bill Auction', 'Leilão de T-Bills'],
    ['Non-Monetary Policy Meeting', 'Reunião de política não monetária'],
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
    // Holiday and observance names - nager publishes these in English only.
    ['New Year\'s Day', 'Año Nuevo'],
    ['New Year\'s Eve', 'Nochevieja'],
    ['Christmas Day', 'Navidad'],
    ['Christmas Eve', 'Nochebuena'],
    ['Good Friday', 'Viernes Santo'],
    ['Easter Monday', 'Lunes de Pascua'],
    ['Boxing Day', 'Día de San Esteban'],
    ['All Saints\' Day', 'Día de Todos los Santos'],
    ['Assumption of Mary', 'Asunción de la Virgen'],
    ['Immaculate Conception', 'Inmaculada Concepción'],
    ['Day of Our Lady of the Seven Sorrows', 'Día de Nuestra Señora de los Siete Dolores'],
    ['Feast of Our Lady of', 'Fiesta de Nuestra Señora de'],
    ['Thanksgiving Day', 'Día de Acción de Gracias'],
    ['Memorial Day', 'Día de los Caídos'],
    ['Veterans Day', 'Día de los Veteranos'],
    ['Columbus Day', 'Día de la Hispanidad'],
    ['Presidents\' Day', 'Día de los Presidentes'],
    ['Independence Day', 'Día de la Independencia'],
    ['Unification Day', 'Día de la Unificación'],
    ['Labour Day', 'Día del Trabajo'],
    ['Labor Day', 'Día del Trabajo'],
    ['National Day Golden Week', 'Semana Dorada (fiesta nacional)'],
    ['National Day', 'Fiesta nacional'],
    ['National holiday', 'Fiesta nacional'],
    ['Mid-Autumn Festival', 'Fiesta del Medio Otoño'],
    ['Respect for the Aged Day', 'Día del Respeto a los Ancianos'],
    ['Army Day', 'Día del Ejército'],
    ['Rosh Hashanah', 'Rosh Hashaná'],
    ['Father\'s Day', 'Día del Padre'],
    ['Mother\'s Day', 'Día de la Madre'],

    // Indicators the feeds publish that the first pass missed.
    ['EIA Distillate Fuel Production Change', 'Variación de la producción de destilados (EIA)'],
    ['EIA Refinery Crude Runs Change', 'Procesamiento de crudo en refinerías (EIA)'],
    ['EIA Gasoline Production Change', 'Variación de la producción de gasolina (EIA)'],
    ['EIA Heating Oil Stocks Change', 'Variación de inventarios de gasóleo de calefacción (EIA)'],
    ['EIA Distillate Stocks Change', 'Variación de inventarios de destilados (EIA)'],
    ['EIA Gasoline Stocks Change', 'Variación de inventarios de gasolina (EIA)'],
    ['API Crude Oil Stock Change', 'Variación de inventarios de crudo (API)'],
    ['Baker Hughes Total Rigs Count', 'Total de perforadoras activas (Baker Hughes)'],
    ['Baker Hughes Oil Rig Count', 'Perforadoras de petróleo activas (Baker Hughes)'],
    ['Jobless Claims 4-week Average', 'Media de 4 semanas de peticiones de subsidio'],
    ['Participation Rate', 'Tasa de actividad'],
    ['Unemployed Persons', 'Número de desempleados'],
    ['BCB Focus Market Readout', 'Boletín Focus (BCB)'],
    ['BoJ JGB Purchase', 'Compra de JGB (BoJ)'],
    ['Deposit Facility Rate', 'Tipo de la facilidad de depósito'],
    ['Overnight Lending Rate', 'Tipo de préstamo a un día'],
    ['Fed Balance Sheet', 'Balance de la Fed'],
    ['Budget Balance', 'Saldo presupuestario'],
    ['Treasury Cash Balance', 'Saldo de caja del Tesoro'],
    ['External Debt', 'Deuda externa'],
    ['Foreign Direct Investment', 'Inversión extranjera directa'],
    ['Foreign Bond Investment', 'Inversión extranjera en bonos'],
    ['Stock Investment by Foreigners', 'Inversión extranjera en acciones'],
    ['MBA Purchase Index', 'Índice de compras (MBA)'],
    ['Eco Watchers Survey Current', 'Encuesta Eco Watchers (actual)'],
    ['Eco Watchers Survey Outlook', 'Encuesta Eco Watchers (perspectivas)'],
    ['NFIB Business Optimism Index', 'Índice de optimismo empresarial (NFIB)'],
    ['Leading Indicators', 'Indicadores adelantados'],
    ['Revised GDP', 'PIB revisado'],
    ['Core CPI', 'IPC subyacente'],
    ['Core PPI', 'IPP subyacente'],
    ['CPI', 'IPC'],
    ['PPI', 'IPP'],
    ['HPI', 'Índice de precios de vivienda'],
    ['BRICS Summit', 'Cumbre de los BRICS'],
    ['ECOFIN Meeting', 'Reunión del ECOFIN'],

    // Period suffixes. ForexFactory lowercases what TradingView writes as MoM.
    ['m/m', '(mensual)'],
    ['q/q', '(trimestral)'],
    ['y/y', '(interanual)'],
    ['w/w', '(semanal)'],

    // Last resort: a bare Change, after every compound above has had its turn.
    ['Consumer Confidence Change', 'Variación de la confianza del consumidor'],
    ['Consumer Credit Change', 'Variación del crédito al consumo'],
    ['Unemployment Change', 'Variación del desempleo'],
    ['Production Change', 'Variación de la producción'],
    ['Stocks Change', 'Variación de inventarios'],
    ['Stock Change', 'Variación de inventarios'],
    ['Change', 'Variación'],

    // Hyphenated compounds: one word, not two.
    ['T-Bill Auction', 'Subasta de letras del Tesoro'],
    ['Non-Monetary Policy Meeting', 'Reunión de política no monetaria'],
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

/**
 * Compiled once per language: longest phrase first, each anchored to word
 * edges.
 *
 * The length sort is why a specific rule always beats a generic one —
 * "Core Inflation Rate" before "Inflation Rate", every compound before the
 * bare "Change". The anchoring is why "Adv" no longer turns
 * "Job Advertisements" into "Job préviaertisements", and why "CPI" leaves
 * Sweden's "CPIF" alone: a plain substring replace had no way to tell a whole
 * word from the start of a longer one. That matters more than the tables do —
 * the feeds publish titles nobody here has seen yet, and a rule that can only
 * fire on a word edge is a rule that cannot corrupt one.
 *
 * The leading edge is a capture group rather than a lookbehind, so the page
 * still runs on Safari before 16.4.
 */
/**
 * A hyphen binds like a letter. Treating it as a gap let "Bill Auction" fire
 * inside "T-Bill Auction" and, worse, let "Monetary Policy Meeting" fire
 * inside the ECB's "Non-Monetary Policy Meeting" — inverting the meaning
 * rather than merely mangling the spelling.
 */
const WORD = 'A-Za-z0-9-';

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(table) {
  return [...table]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([english, translated]) => [
      // The feeds spell the same indicator with a space or a hyphen from one
      // week to the next — "Non Farm Payrolls" and "Non-Farm Payrolls" are
      // one release. Treat the two as interchangeable so a table entry does
      // not need a row per spelling.
      new RegExp(
        `(^|[^${WORD}])${escapeForRegExp(english).replace(/ /g, '[ -]')}(?![${WORD}])`,
        'g',
      ),
      translated,
    ]);
}

const COMPILED = Object.fromEntries(
  Object.entries(PHRASES).map(([lang, table]) => [lang, compile(table)]),
);

/** Translate an English indicator title into the active language. */
export function eventTitle(title) {
  const phrases = COMPILED[current];
  if (!phrases || !title) return title;

  let output = title;
  for (const [pattern, translated] of phrases) {
    output = output.replace(pattern, (match, before) => before + translated);
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
