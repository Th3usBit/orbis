<div align="center">

# orbis

**O calendário econômico mundial, num globo.**

Cada divulgação econômica agendada, decisão de banco central e feriado de mercado da Terra — num globo 3D ao vivo, iluminado pela posição real do sol.

Sem chave de API. Sem backend. Sem plano pago. Clone e rode `start.bat`.

[English](README.md) · [Demo ao vivo](https://th3usbit.github.io/orbis/) · [Reportar um problema](https://github.com/Th3usBit/orbis/issues)

</div>

---

## O que é

Um calendário econômico normalmente é uma planilha: uma parede de linhas ordenada por horário. Esse formato esconde as duas coisas que realmente importam — **onde** o dinheiro está se movendo e **quando**, em relação ao mercado que está acordado agora.

O orbis põe os mesmos dados num globo giratório:

- **Pilares** sobem de cada país com eventos no dia selecionado. Altura e cor codificam o impacto de mercado.
- **A metade iluminada do planeta é real.** O terminador dia/noite é calculado a partir do ponto subsolar de verdade, então dá para ver num relance se Tóquio está operando enquanto Frankfurt dorme.
- **Anéis pulsam** somente em divulgações que acontecem na próxima hora — nada anima por enfeite.
- **Uma faixa de timeline** na base mostra a carga de cada dia da janela como um micro-gráfico empilhado, então uma semana pesada aparece antes de você clicar nela.

Tudo é bilíngue (Português / English), incluindo os nomes dos indicadores traduzidos.

## Começando

**Windows**

```bat
git clone https://github.com/Th3usBit/orbis.git
cd orbis
start.bat
```

**Linux / macOS**

```bash
git clone https://github.com/Th3usBit/orbis.git
cd orbis
./start.sh
```

É toda a instalação. O `start` encontra o Python 3, gera a geometria do globo na primeira execução, busca o calendário mais recente e abre a página em `http://127.0.0.1:8080`.

O único requisito é **Python 3.9+**, e apenas a biblioteca padrão é usada — não existe `pip install`, nem `package.json`, nem ferramenta de build.

Já tem os dados e só quer a página?

```bat
start.bat offline
```

## Como funciona

Nenhum dos provedores gratuitos de calendário envia cabeçalhos CORS, então o navegador não consegue chamá-los direto. O orbis transforma essa limitação em vantagem:

```
  ┌────────────────────┐     de hora em hora, no GitHub Actions
  │  scripts/fetch.py  │  ── ou quando você roda o start ──────┐
  └────────────────────┘                                       │
      │                                                        ▼
      ├─ TradingView      (primária: global, com impacto)
      ├─ ForexFactory     (conferência: moedas principais)   data/calendar.json
      └─ Nager.Date       (contexto: feriados de mercado)    um arquivo estático
                                                               │
                                                               ▼
                                                 ┌────────────────────────┐
                                                 │  index.html + three.js │
                                                 │  lê o arquivo e desenha│
                                                 │  o globo. Sem servidor.│
                                                 └────────────────────────┘
```

Como a saída é um único JSON estático, o site inteiro roda no GitHub Pages de graça, para sempre, sem servidor para manter no ar e sem chave para vazar.

**Reconciliação.** As duas fontes de calendário são mescladas, não concatenadas. Eventos de provedores diferentes são tratados como a mesma divulgação quando compartilham o país, caem dentro de 45 minutos um do outro e têm títulos suficientemente parecidos. As coincidências recebem a marca `confirmed_by`, e a interface sinaliza com `✦` — uma divulgação em que duas fontes independentes concordam vale mais do que uma que aparece num feed só. Eventos do feed secundário que não casam com nada são mantidos como acréscimos legítimos.

**Isolamento de falhas.** Cada fonte roda de forma independente. Se uma cair, a execução ainda conclui, a falha é registrada dentro do `data/calendar.json`, e o painel de Fontes mostra um ponto vermelho com o erro. O coletor se recusa a sobrescrever dados bons com um resultado vazio.

## Fontes de dados

Todas gratuitas, todas sem chave, todas acessíveis sem conta.

| Fonte | Papel | Cobertura | Por que essa |
|---|---|---|---|
| [TradingView Economic Calendar](https://www.tradingview.com/economic-calendar/) | primária | ~80 países | O feed gratuito mais rico: classificação de importância, efetivo/projeção/anterior como números, unidades e link para a instituição que divulga |
| [ForexFactory](https://www.forexfactory.com/calendar) via o JSON semanal da FairEconomy | conferência | moedas principais | Mantido de forma independente, então corrobora a fonte primária e preenche as lacunas dela |
| [Nager.Date](https://date.nager.at) | contexto | mundial | API open-source de feriados públicos — diz quando um mercado está simplesmente fechado |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | geometria | mundial | Litorais e fronteiras em domínio público, usados uma vez em tempo de build |

**Fontes avaliadas e descartadas:**

- **Trading Economics** — a conta `guest:guest` retorna `410 Gone`; a API agora é só paga.
- **MQL5** — sem API pública. O calendário deles é um endpoint interno, sem termos de uso para terceiros.
- **FRED** — excelente e autoritativa, mas exige chave de API, o que quebra a promessa de "clonar e rodar". É uma boa adição opcional para as datas de divulgação dos EUA (veja o roadmap).

> **Sobre termos de uso.** Esses são endpoints públicos, sem chave, que alimentam os próprios widgets públicos dos provedores, e o orbis os consulta uma vez por hora — mais ou menos o que uma pessoa lendo o site geraria. Os dados são informação factual de agendamento (datas, instituições, números publicados), que não é protegida por direito autoral em si, e cada evento tem link de volta para a fonte. Se você rodar um fork em frequência maior, seja um bom cidadão e use cache com folga. Se você é um provedor e quer uma mudança, abra uma issue.

## Estrutura do projeto

```
orbis/
├── index.html              página única — toda a interface
├── css/orbis.css           design system: tokens, painéis de vidro, timeline
├── js/
│   ├── main.js             boot, tickers, ligação de tudo
│   ├── globe.js            cena three.js, shaders, voos de câmera
│   ├── store.js            estado e todos os seletores derivados
│   ├── panels.js           renderização DOM das laterais e da timeline
│   └── i18n.js             textos EN/PT-BR + tradução de indicadores
├── scripts/
│   ├── fetch.py            coleta → reconcilia → publica
│   ├── build_geometry.py   TopoJSON → matriz de pontos + fronteiras (roda uma vez)
│   ├── serve.py            servidor estático de dev, sem cache
│   └── sources/            um módulo por provedor
├── tests/store.test.mjs    testes da camada de estado (opcional, precisa de Node)
├── data/
│   ├── calendar.json       gerado — o único arquivo que a página lê
│   └── countries.json      referência mantida à mão (capitais, moedas)
└── assets/                 geometria do globo, gerada
```

## Configuração

**Janela de tempo.** Padrão de 7 dias para trás e 21 para frente:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Densidade do globo.** Mude `DOT_SPACING_DEG` em `scripts/build_geometry.py` (menor = mais pontos), apague `assets/land-dots.json` e rode de novo.

**Cores de impacto.** Definidas uma vez em `css/orbis.css` como `--impact-*` e espelhadas em `js/globe.js` como `IMPACT_COLORS` — mude nos dois.

## Contribuindo

Pull requests são bem-vindos. As contribuições mais fáceis e úteis:

- **Adicionar um país.** Uma linha em `data/countries.json` com as coordenadas da capital e a moeda.
- **Melhorar uma tradução.** `PHRASES_PT` em `js/i18n.js` mapeia nomes de indicadores do inglês para o português, frase mais longa primeiro. Qualquer frase não mapeada cai de volta para o inglês, então cobertura parcial é segura.
- **Adicionar uma fonte.** Coloque um módulo em `scripts/sources/` expondo `ID`, `NAME`, `HOMEPAGE` e um `fetch()` que devolve o formato normalizado de evento, depois registre em `scripts/fetch.py`. Só fontes gratuitas e sem chave, por favor — essa restrição é o ponto do projeto.
Antes de abrir um PR, rode as verificações da camada de estado contra os seus
próprios dados recém-coletados:

```bash
python scripts/fetch.py
node tests/store.test.mjs .
```

- **Afinar o classificador.** `CATEGORY_PATTERNS` em `scripts/sources/classify.py` decide em qual categoria um evento cai. Eventos mal classificados são fáceis de notar e fáceis de corrigir.

## Roadmap

- [ ] Integração opcional com o FRED para datas oficiais de divulgação dos EUA (opt-in por chave)
- [ ] Calendários de reunião de bancos centrais coletados direto das instituições
- [ ] Índice histórico de surpresa por país
- [ ] three.js embarcado no repo para a página funcionar 100% offline
- [ ] Exportação iCal dos eventos que passam pelos seus filtros

## Aviso

O orbis é uma ferramenta informativa e educacional. Ele agrega dados de agenda publicados publicamente e **não é recomendação de investimento**. Números podem ser revisados, feeds podem errar e horários podem mudar. Confirme qualquer coisa que você pretenda operar direto na instituição que divulga — cada evento tem link para a fonte exatamente por isso.

## Licença

[MIT](LICENSE) — o código. Os dados de calendário pertencem aos respectivos provedores, todos creditados no painel de Fontes e linkados em cada evento.
