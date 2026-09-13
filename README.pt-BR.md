<div align="center">

# orbis

**O calendário econômico mundial, num globo.**

Cada divulgação econômica agendada, decisão de banco central e feriado de mercado da Terra — num globo 3D ao vivo, iluminado pela posição real do sol.

Sem chave de API. Sem backend. Sem plano pago. Clone e rode `start.bat`.

[English](README.md) · [Demo ao vivo](https://th3usbit.github.io/orbis/) · [Reportar um problema](https://github.com/Th3usBit/orbis/issues)

</div>

---

## Índice

[O que é](#o-que-é) · [Começando](#começando) · [Como funciona](#como-funciona) · [Arquitetura](#arquitetura) · [O pipeline de dados](#o-pipeline-de-dados) · [O navegador](#o-navegador) · [Automação](#automação-ci-e-deploy) · [Fontes de dados](#fontes-de-dados) · [Estrutura do projeto](#estrutura-do-projeto) · [Configuração](#configuração) · [Rodando o seu](#rodando-o-seu) · [Contribuindo](#contribuindo) · [Roadmap](#roadmap) · [Licença](#licença)

---

## O que é

Um calendário econômico normalmente é uma planilha: uma parede de linhas ordenada por horário. Esse formato esconde as duas coisas que realmente importam — **onde** o dinheiro está se movendo e **quando**, em relação ao mercado que está acordado agora.

O orbis põe os mesmos dados num globo giratório:

- **Pilares** sobem de cada país com eventos no dia selecionado. Altura e cor codificam o impacto de mercado.
- **A metade iluminada do planeta é real.** O terminador dia/noite é calculado a partir do ponto subsolar de verdade, corrigido pela equação do tempo, então dá para ver num relance se Tóquio está operando enquanto Frankfurt dorme.
- **Anéis pulsam** somente em divulgações que acontecem na próxima hora — nada anima por enfeite.
- **Uma faixa de timeline** na base mostra a carga de cada dia da janela como um micro-gráfico empilhado, então uma semana pesada aparece antes de você clicar nela.
- **Leve com você.** O que estiver no painel — um dia, um país, o que os seus filtros deixaram — sai em `.csv` para planilha ou `.ics` para o seu calendário. O arquivo é montado no seu navegador e salvo direto no seu disco; nada é enviado para lugar nenhum.

Toda a interface fala Português, English e Español, incluindo nomes de indicadores e de países traduzidos. Na primeira visita ela adota o idioma do navegador e, depois disso, lembra a sua escolha.

Tudo na tela está em **UTC**, porque essa é a única escolha honesta para um calendário que cobre todos os mercados. O topo diz isso, e mostra a quanto o seu relógio está de distância.

---

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

O único requisito é **Python 3.9+**, e apenas a biblioteca padrão é usada — não existe `pip install`, nem `package.json`, nem ferramenta de build. O Node 18+ só é preciso para rodar os testes; o site nunca precisa dele.

> **O repositório não contém dados.** Um clone traz apenas o código-fonte: o calendário e a geometria do globo são gerados na sua máquina, na primeira execução, a partir de endpoints públicos. Isso é proposital — ninguém herda um retrato velho da sessão de outra pessoa, e o histórico do git não carrega um arquivo de meio megabyte que muda toda hora. A primeira execução precisa de internet e leva cerca de um minuto; as seguintes são instantâneas.

Depois de gerados, os dados são seus. O `offline` pula os coletores e serve o que você já tem:

```bat
start.bat offline     :: Windows
./start.sh offline    # Linux / macOS
```

Isso é offline de verdade: o Three.js e as fontes estão versionados em [`vendor/`](vendor/), então a página não carrega nada de CDN e **nenhuma requisição do seu navegador sai da origem**. Com globo e tudo, no avião.

---

## Como funciona

Nenhum dos provedores gratuitos de calendário envia cabeçalhos CORS, então o navegador não consegue chamá-los direto. O orbis transforma essa limitação em vantagem: um coletor roda *fora* do navegador, reconcilia todos os feeds num arquivo só, e a página lê apenas esse arquivo.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  COLETA — python, apenas biblioteca padrão                           │
  │  roda no deploy dentro do CI, ou na sua máquina quando você usa start│
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │   TradingView ──┐  primária     cobertura global, com impacto        │
  │   ForexFactory ─┼─► merge()  ◄── reconcilia, não concatena           │
  │   Nager.Date ───┘  contexto     feriados de mercado                  │
  │                      │                                               │
  │                      ▼                                               │
  │              data/calendar.json    um arquivo estático, ~550 KB      │
  └──────────────────────┬───────────────────────────────────────────────┘
                         │  sobe como artefato do Pages, nunca é commitado
                         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  RENDERIZAÇÃO — o navegador, sem framework, sem bundler              │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │   store.js  ── estado + seletores ──► subscribe(motivo)              │
  │      │                                   │                           │
  │      │                                   ├──► globe.js   three.js    │
  │      │                                   ├──► panels.js  DOM         │
  │      └── calendar.json ──────────────────┴──► i18n.js    EN/PT/ES    │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

Como a saída é um único JSON estático, o site inteiro roda no GitHub Pages de graça, para sempre, **sem servidor para manter no ar e sem chave para vazar**.

---

## Arquitetura

Duas metades que nunca se encontram em tempo de execução. O coletor escreve um arquivo; o navegador lê. Não há API entre eles, e é isso que elimina o backend por completo.

| | Coletor | Navegador |
|---|---|---|
| Linguagem | Python 3.9+, só stdlib | ES modules puro |
| Dependências | nenhuma | three.js (versionado) |
| Roda | no CI, ou local via `start` | na máquina de quem acessa |
| Saída | `data/calendar.json` | pixels |
| Rede | os três provedores | só a própria origem |

**Por que sem framework.** A página é uma tela só, com um punhado de visões derivadas. Um store com um callback `subscribe` e funções que reescrevem a própria subárvore bastam — e isso significa que o site não tem passo de build: o que está no repositório é o que roda no navegador. Você lê um stack trace contra o código real.

**Por que dependências versionadas.** Three.js e as duas fontes estão commitadas em `vendor/`. Um CDN é um terceiro que enxerga cada visitante, pode cair ou pode mudar o que serve. Versionar custa ~930 KB no repositório e compra uma página que funciona offline e não faz nenhuma requisição a terceiros — promessa que o `tests/offline.test.mjs` cobra a cada execução do CI.

---

## O pipeline de dados

### 1. Coletar

Cada fonte é um módulo em `scripts/sources/` que expõe o mesmo contrato:

```python
ID = "tradingview"            # identificador estável, usado nos ids dos eventos
NAME = "TradingView Economic Calendar"
HOMEPAGE = "https://..."      # aparece no painel de Fontes

def fetch(window, ...) -> list[dict]:
    """Eventos normalizados, ou levanta exceção em caso de falha."""
```

O `collect()` em [`scripts/fetch.py`](scripts/fetch.py) roda cada um dentro de um `try/except`, então **uma fonte fora do ar não derruba a execução** — a falha é registrada na saída com o erro, e o painel de Fontes mostra um ponto vermelho com o motivo.

Uma fonte precisa *levantar exceção* ao falhar, em vez de devolver lista vazia. Devolver `[]` torna um apagão indistinguível de uma semana fraca, que é exatamente o que o relatório existe para evitar.

### 2. Normalizar

Os provedores discordam sobre tudo, então cada módulo mapeia as linhas dele para um esquema único:

| campo | significado |
|---|---|
| `id` | estável e único — deduplica entre feeds semanais e entre execuções |
| `ts` | ISO 8601 em UTC, sempre terminando em `Z` |
| `country` | ISO 3166-1 alfa-2, precisa existir em `data/countries.json` |
| `title`, `indicator` | o que foi divulgado |
| `category` | um de 13 buckets derivados do título pelo `classify.py`, mais `holiday` vindo do coletor de feriados |
| `impact` | `0` feriado · `1` baixo · `2` médio · `3` alto |
| `actual`, `forecast`, `previous` | números, ou ausentes |
| `unit`, `period`, `issuer` | contexto para a visão detalhada |
| `source`, `source_url` | atribuição; a URL é o único campo que vira link |

Os números de tipagem solta passam pelo `to_number()`, que entende `3.2%`, `-1.4K`, `215B`, `1,234.5` **e** `1.234,5` — o mesmo número em duas convenções. Ele devolve `None` para `NaN` e infinitos, porque o `json.dump` escreve esses como literais que nenhum parser JSON aceita: um único valor desses tornaria o arquivo inteiro ilegível e derrubaria a página junto.

### 3. Reconciliar

Os dois feeds de calendário são **mesclados, não concatenados**. Duas linhas são a mesma divulgação quando compartilham o país, caem dentro de 45 minutos uma da outra e têm títulos suficientemente parecidos — com travas que uma razão de similaridade sozinha erraria:

- **O período tem que bater.** `CPI MoM` e `CPI YoY` são divulgações diferentes com nomes quase idênticos.
- **A polaridade não pode inverter.** `Exports` vs `Imports`, `Unemployment` vs `Employment`, `Core` vs não-core, `Prelim` vs `Final`.
- **A escala tem que ser plausível.** Um nível de índice (~330) e uma variação percentual (~0,4) nunca são o mesmo número reportado duas vezes.

As coincidências recebem a marca `confirmed_by` e um `✦` na interface — uma divulgação em que duas fontes independentes concordam vale mais do que uma que aparece num feed só. Linhas do feed secundário que não casam com nada são mantidas como acréscimos legítimos.

### 4. Publicar

O `fetch.py` escreve um arquivo e se recusa a escrever um ruim:

- **Nada coletado** → sai com 1, dados existentes intactos.
- **A fonte primária falhou** → sai com 1. Ela carrega ~96% dos eventos, então publicar sem ela trocaria ~1800 linhas por ~90 enquanto toda verificação seguinte ainda passaria. Um calendário desatualizado com um `generated_at` honesto vale mais do que um que parece atual e perdeu dezenove divulgações em vinte. O `--allow-partial` sobrepõe isso deliberadamente.
- Campos `None` são descartados em vez de serializados — com ~1800 eventos, isso é um terço do que o navegador baixaria.

---

## O navegador

### Mapa dos módulos

| arquivo | responsabilidade |
|---|---|
| [`js/store.js`](js/store.js) | estado, todos os seletores derivados, a paleta de impacto. O dono único da lógica de datas. |
| [`js/globe.js`](js/globe.js) | a cena three.js: shaders, marcadores, voos de câmera, o terminador |
| [`js/panels.js`](js/panels.js) | renderização DOM das laterais, da timeline e do tooltip |
| [`js/i18n.js`](js/i18n.js) | textos da UI mais tradução de indicadores frase a frase |
| [`js/export.js`](js/export.js) | geração de `.ics` e `.csv`, como funções puras |
| [`js/main.js`](js/main.js) | boot, tickers, ligação de tudo |

Tudo a jusante lê do store e re-renderiza no `subscribe(motivo)`. As funções de render são puras no sentido que importa: leem o estado e reescrevem a própria subárvore, sem diffing parcial. Essas listas são pequenas o bastante para que clareza valha mais que os microssegundos.

### Dois relógios, de propósito

Os dias são indexados no **seu fuso local**, porque é assim que as pessoas leem um calendário. O terminador do globo fica no **UTC real**, porque o sol não se importa com onde você está.

Eventos de dia inteiro são a exceção que confirma a regra: um feriado é uma data, não um instante. Natal é dia 25 em Auckland e em Los Angeles igualmente, então a data nominal é lida direto da string e nunca convertida — o mesmo raciocínio que a exportação `.ics` segue.

### O globo

Camadas, do centro para fora: oceano iluminado pelo ponto subsolar · uma matriz de pontos de terra em área igual · fronteiras dos países · um graticulado · pilares de marcador · anéis de pulso · uma atmosfera fresnel aditiva.

Tudo que anima é movido por um número que de fato mudou: o sol se move porque o tempo passou, um marcador pulsa porque uma divulgação está próxima. O giro ocioso respeita `prefers-reduced-motion`, lido ao vivo — quem acessa pode mudar a preferência com a página já aberta.

---

## Automação, CI e deploy

O site **não tem backend**, então o `calendar.json` é assado dentro do artefato publicado. Isso significa que *a única coisa que atualiza os dados é um deploy*.

```
  push na main ─┐
  cron */3h ────┼──► Deploy to Pages ──► gera geometria ──► coleta calendário
  manual  ──────┘                                │
                                                 ├──► versiona os assets (?v=sha)
                                                 └──► sobe o artefato ──► Pages
```

| workflow | gatilhos | o que faz |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | push, PR, manual | Constrói a partir de um checkout limpo no Linux, Windows e macOS, mais um job no Python 3.9 — a versão que este README promete. Roda seis suítes headless, e a suíte de navegador no Linux. |
| [`pages.yml`](.github/workflows/pages.yml) | push, cron, manual | Reconstrói tudo do zero e publica. Nada é commitado de volta. |

Três coisas que vale saber se você mantém um fork:

- **Uma execução agendada não é promessa.** O GitHub atrasa o evento `schedule` sob carga e **descarta** os disparos que não aceita, em vez de enfileirá-los — medido aqui: pedindo oito por dia, chegam cerca de quatro. Tudo bem, porque cada build é uma reconstrução completa, então uma execução que roda cobre tudo que as descartadas fariam.
- **O GitHub desativa workflows agendados em repositórios públicos após 60 dias sem atividade.** Nada mais reconstrói e, como o coletor só enxerga 21 dias à frente, o site continua servindo até a janela acabar e então fica vazio sem que nada pareça quebrado. Reative pela aba Actions ou com `gh workflow enable "Deploy to Pages"`.
- **O CI passa `--allow-partial`; o deploy não.** O CI pergunta se um clone limpo constrói e roda — se o TradingView está no ar esta tarde não é pergunta dele, e o PR só-de-CSS de um contribuidor não deveria ficar vermelho porque um terceiro teve um apagão. Publicar é onde a trava rígida pertence.

### Testes

```bash
node tests/store.test.mjs .       # camada de estado e todos os seletores
node tests/format.test.mjs .      # formatação de número, segurança de URL, astronomia
node tests/export.test.mjs .      # o .ics e o .csv que o painel entrega
node tests/i18n.test.mjs .        # paridade EN/PT/ES, contra títulos reais dos feeds
node tests/merge.test.mjs .       # a forma do conjunto reconciliado
node tests/offline.test.mjs .     # nada busca um CDN
node tests/ui.test.mjs .          # a página real num navegador real (Playwright)
```

As seis primeiras precisam só do Node. A suíte de navegador mede contraste em pixels renderizados em vez de cores declaradas, confere alcance pelo teclado e o layout em quatro larguras; é opcional localmente e roda no Linux dentro do CI, instalada fora do checkout para que nada entre no repositório.

O calendário é reconstruído a cada execução, então esses testes conferem contra **o que os feeds publicaram hoje**, não contra um fixture. O `i18n.test.mjs` falha numa frase que nunca dispara, num idioma sem uma chave que os outros têm, e em qualquer título que saia emendado.

---

## Fontes de dados

Todas gratuitas, todas sem chave, todas acessíveis sem conta.

| Fonte | Papel | Cobertura | Por que essa |
|---|---|---|---|
| [TradingView](https://www.tradingview.com/economic-calendar/) | primária | ~80 países | O feed gratuito mais rico: classificação de importância, efetivo/projeção/anterior como números, unidades e link para a instituição que divulga |
| [ForexFactory](https://www.forexfactory.com/calendar) via o JSON semanal da FairEconomy | conferência | moedas principais | Mantido de forma independente, então corrobora a fonte primária e preenche as lacunas dela |
| [Nager.Date](https://date.nager.at) | contexto | mundial | API open-source de feriados públicos — diz quando um mercado está simplesmente fechado |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | geometria | mundial | Litorais e fronteiras em domínio público, usados uma vez em tempo de build |

**Avaliadas e descartadas:**

- **Trading Economics** — a conta `guest:guest` retorna `410 Gone`; a API agora é só paga.
- **MQL5** — sem API pública. O calendário deles é um endpoint interno, sem termos de uso para terceiros.
- **FRED** — autoritativa, mas exige chave de API *e* publica apenas uma data seca, sem hora, o que é estritamente menos preciso do que o TradingView já entrega para as mesmas divulgações dos EUA. Seria um downgrade em todos os campos que o orbis publica.

> **Sobre termos de uso.** Esses são endpoints públicos, sem chave, que alimentam os próprios widgets públicos dos provedores, e a demo publicada os consulta algumas vezes por dia — bem menos do que uma pessoa lendo o site geraria. Os dados são informação factual de agendamento (datas, instituições, números publicados), que não é protegida por direito autoral em si, e cada evento tem link de volta para a fonte. Se você rodar um fork em frequência maior, seja um bom cidadão e use cache com folga. Se você é um provedor e quer uma mudança, abra uma issue.

---

## Estrutura do projeto

```
orbis/
├── index.html              página única — toda a interface
├── css/orbis.css           design system: tokens, painéis de vidro, timeline
├── js/
│   ├── main.js             boot, tickers, ligação de tudo
│   ├── store.js            estado, seletores, a paleta de impacto
│   ├── globe.js            cena three.js, shaders, voos de câmera
│   ├── panels.js           renderização DOM das laterais e da timeline
│   ├── export.js           geração de .ics e .csv
│   └── i18n.js             textos EN/PT/ES + tradução de indicadores
├── scripts/
│   ├── fetch.py            coleta → reconcilia → publica
│   ├── build_geometry.py   TopoJSON → pontos de terra + fronteiras (uma vez)
│   ├── serve.py            servidor estático de dev, sem cache
│   └── sources/            um módulo por provedor
├── tests/                  sete suítes; seis precisam só do Node
├── vendor/                 three.js e as fontes, versionados de propósito
├── data/countries.json     o único dado versionado: nomes, coordenadas, regiões
└── .github/workflows/      CI e o deploy do Pages
```

**Gerado, nunca versionado** — o `.gitignore` garante:

| caminho | tamanho | gerado por |
|---|---|---|
| `data/calendar.json` | ~550 KB | `scripts/fetch.py`, a cada execução |
| `assets/land-dots.json` | ~95 KB | `scripts/build_geometry.py`, uma vez |
| `assets/borders.json` | ~104 KB | `scripts/build_geometry.py`, uma vez |

---

## Configuração

**Janela de tempo.** O padrão é 7 dias para trás e 21 para frente:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Densidade do globo.** Mude `DOT_SPACING_DEG` em `scripts/build_geometry.py` (menor = mais pontos), apague `assets/land-dots.json` e rode de novo.

**Cores de impacto.** Definidas em [`js/store.js`](js/store.js) como `IMPACT_COLORS` e espelhadas em `css/orbis.css` como `--impact-*` — mude nos dois, e o comentário no CSS diz isso.

**Frequência de reconstrução.** O bloco `schedule:` em `.github/workflows/pages.yml`. Apague se preferir que não rode.

---

## Rodando o seu

O orbis foi feito para ser forkado e auto-hospedado, sem nada para configurar e sem ninguém para pedir permissão:

1. Faça o fork do repositório.
2. Faça qualquer push, ou rode o workflow **Deploy to Pages** na mão.

A primeira execução liga o Pages sozinha (o `configure-pages` usa `enablement: true`), então realmente não há nada para configurar antes. Se a sua organização bloquear isso, ligue à mão em **Settings → Pages → Source: GitHub Actions** e rode o workflow de novo.

O seu fork gera a própria geometria, coleta o próprio calendário e publica na sua URL `github.io`. **Nenhum segredo para adicionar, nenhuma chave de API, nenhuma conta em provedor de dados e nenhum bot commitando dados nas suas branches.**

A reconstrução é agendada a cada três horas, o que na prática entrega algumas execuções por dia — veja [Automação](#automação-ci-e-deploy) para entender por quê, e para a regra dos 60 dias de inatividade que vai silenciá-la se você parar de fazer push.

---

## Contribuindo

Issues e pull requests são bem-vindos. O [`CONTRIBUTING.md`](CONTRIBUTING.md) tem os detalhes; a versão curta:

- **Somente fontes gratuitas e sem chave.** Essa restrição é o ponto do projeto.
- **Sem dependências.** Biblioteca padrão do Python, JavaScript puro. Se uma mudança precisa de `pip install` ou de um `package.json`, a promessa foi quebrada.
- **Comentários explicam o *porquê*, com detalhe medido.** O código é cheio deles: por que o limiar de coincidência é 0,90, por que o terminador precisou da equação do tempo, por que uma barra de rolagem dentro de um grupo era o pior dos dois mundos. Um comentário que repete o código é ruído; um que registra o que foi medido é o que torna a próxima mudança segura.
- Rode as suítes antes de abrir um PR.

Adicionar um idioma são quatro edições: um bloco em `UI` e uma tabela de frases em `PHRASES` no `js/i18n.js`, uma coluna `name_xx` em `data/countries.json`, e um botão com a bandeira no `index.html`. O `tests/i18n.test.mjs` cobra o resto.

---

## Roadmap

- [x] three.js embarcado no repo para a página funcionar 100% offline
- [x] Exportar os eventos da tela — `.csv` para planilha, `.ics` para o calendário
- [ ] Calendários de reunião de bancos centrais coletados direto das instituições — os feeds param em ~33 dias, os bancos publicam anos à frente
- [ ] Um aviso de dados desatualizados quando o `generated_at` ficar velho demais

---

## Aviso

O orbis é uma ferramenta informativa e educacional. Ele agrega dados de agenda publicados publicamente e **não é recomendação de investimento**. Números podem ser revisados, feeds podem errar e horários podem mudar. Confirme qualquer coisa que você pretenda operar direto na instituição que divulga — cada evento tem link para a fonte exatamente por isso.

---

## Licença

[MIT](LICENSE) — **o código**: use, forke, venda, sem exigência além do aviso de licença.

O código de terceiros em [`vendor/`](vendor/) mantém a licença própria: three.js é MIT, Inter e JetBrains Mono são SIL OFL 1.1, com o texto de cada licença ao lado dos arquivos que ela cobre. O [`NOTICE.md`](NOTICE.md) é a prestação de contas completa — o que vem junto, o que é buscado e o que você precisa manter ao redistribuir.

**Os dados são outra história.** O orbis não distribui nenhum: o calendário é buscado por você, em tempo de execução, direto dos provedores listados acima, e cada um mantém os direitos que tiver sobre o próprio feed. O `calendar.json` gerado não é coberto por esta licença, não é versionado neste repositório e não é redistribuído por ele. A geometria da Natural Earth é domínio público.

Se você redistribuir um fork que já venha com os dados coletados, essa é uma decisão sua com os provedores — não algo que esta licença conceda.
