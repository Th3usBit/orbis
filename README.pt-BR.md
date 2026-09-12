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

Toda a interface fala Português, English e Español, incluindo nomes de indicadores e de países traduzidos. Na primeira visita ela adota o idioma do navegador e, depois disso, lembra a sua escolha.

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

**O repositório não contém dados.** Um clone traz apenas o código-fonte: o calendário e a geometria do globo são gerados na sua máquina, na primeira execução, a partir de endpoints públicos. Isso é proposital — ninguém herda um retrato velho da sessão de outra pessoa, e o histórico do git não carrega um arquivo de 550 KB que muda toda hora. A primeira execução precisa de internet e leva cerca de um minuto; as seguintes são instantâneas.

Depois de gerados, os dados são seus. O `offline` pula os coletores e serve o que você já tem:

```bat
start.bat offline
```

Isso é offline de verdade: o Three.js e as fontes estão versionados em [`vendor/`](vendor/), então a página não carrega nada de CDN e nenhuma requisição do seu navegador sai da origem. Com globo e tudo, no avião.

## Como funciona

Nenhum dos provedores gratuitos de calendário envia cabeçalhos CORS, então o navegador não consegue chamá-los direto. O orbis transforma essa limitação em vantagem:

```
  ┌────────────────────┐     no deploy, dentro do CI
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

Como a saída é um único JSON estático, o site inteiro roda no GitHub Pages de graça, para sempre, sem servidor para manter no ar e sem chave para vazar. A demo publicada é reconstruída do zero a cada deploy e a cada seis horas — o artefato vai direto para o Pages e nunca é commitado, então o repositório permanece limpo.

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
├── tests/                  camada de estado, traduções e a garantia de offline
├── data/
│   ├── calendar.json       gerado, fora do git — o único arquivo que a página lê
│   └── countries.json      referência mantida à mão (capitais, moedas)
├── assets/                 gerado, fora do git — geometria do globo
└── vendor/                 three.js e as fontes, versionados — sem CDN
```

Tudo marcado como *gerado* não existe num clone novo e é reconstruído pelo `start`. Só o `countries.json` é versionado, por ser referência escrita à mão e não um retrato baixado.

## Configuração

**Janela de tempo.** Padrão de 7 dias para trás e 21 para frente:

```bash
python scripts/fetch.py --days-back 14 --days-ahead 45
```

**Densidade do globo.** Mude `DOT_SPACING_DEG` em `scripts/build_geometry.py` (menor = mais pontos), apague `assets/land-dots.json` e rode de novo.

**Cores de impacto.** Definidas uma vez em `css/orbis.css` como `--impact-*` e espelhadas em `js/globe.js` como `IMPACT_COLORS` — mude nos dois.

## Rodando a sua própria

O orbis foi feito para ser forkado e auto-hospedado, sem nada para configurar e sem ninguém para pedir permissão:

1. Faça o fork do repositório.
2. **Settings → Pages → Source: GitHub Actions.**
3. Faça qualquer push, ou rode o workflow **Deploy to Pages** na mão.

O seu fork gera a própria geometria, coleta o próprio calendário e publica na sua URL `github.io`. Nenhum segredo para adicionar, nenhuma chave de API, nenhuma conta em provedor de dados e nenhum bot commitando dados nas suas branches. A reconstrução agendada roda a cada seis horas; se preferir que não rode, apague o bloco `schedule:` em `.github/workflows/pages.yml`.

O `CI` roda o mesmo build no Linux, Windows e macOS a partir de um checkout limpo — é a verificação de que o seu fork continua cumprindo a promessa de clonar e rodar.

## Contribuindo

Veja o [CONTRIBUTING.md](CONTRIBUTING.md) para o setup, as regras da casa e como adicionar uma fonte. Em resumo: sem dados no repositório, sem dependências, sem chaves de API.

As contribuições mais fáceis e úteis:

- **Adicionar um país.** Uma linha em `data/countries.json` com as coordenadas da capital e a moeda.
- **Melhorar uma tradução.** `PHRASES` em `js/i18n.js` mapeia nomes de indicadores, feriados e períodos do inglês para cada idioma. Agrupe uma linha nova onde fizer sentido — a ordenação é resolvida na compilação, e toda regra é ancorada em fronteira de palavra, então nada dispara dentro de uma palavra maior. Qualquer frase não mapeada cai de volta para o inglês, então cobertura parcial é segura.

  O calendário é reconstruído a cada execução, então `tests/i18n.test.mjs` confere as tabelas contra o que as fontes publicaram de fato, não contra um fixture. Ele falha numa frase que nunca dispara, num idioma sem uma chave que os outros têm, e em qualquer título que saia emendado.
- **Adicionar um idioma.** Três edições, sem build: um bloco em `UI` e uma tabela em `PHRASES` (ambos em `js/i18n.js`), uma coluna `name_xx` em `data/countries.json` e um botão com a bandeira no grupo `.lang` do `index.html`.
- **Adicionar uma fonte.** Coloque um módulo em `scripts/sources/` expondo `ID`, `NAME`, `HOMEPAGE` e um `fetch()` que devolve o formato normalizado de evento, depois registre em `scripts/fetch.py`. Só fontes gratuitas e sem chave, por favor — essa restrição é o ponto do projeto.
Antes de abrir um PR, rode as verificações da camada de estado contra os seus
próprios dados recém-coletados:

```bash
python scripts/fetch.py
node tests/store.test.mjs .
node tests/i18n.test.mjs .
node tests/offline.test.mjs .
```

- **Afinar o classificador.** `CATEGORY_PATTERNS` em `scripts/sources/classify.py` decide em qual categoria um evento cai. Eventos mal classificados são fáceis de notar e fáceis de corrigir.

## Roadmap

- [ ] Integração opcional com o FRED para datas oficiais de divulgação dos EUA (opt-in por chave)
- [ ] Calendários de reunião de bancos centrais coletados direto das instituições
- [ ] Índice histórico de surpresa por país
- [x] three.js embarcado no repo para a página funcionar 100% offline
- [ ] Exportação iCal dos eventos que passam pelos seus filtros

## Aviso

O orbis é uma ferramenta informativa e educacional. Ele agrega dados de agenda publicados publicamente e **não é recomendação de investimento**. Números podem ser revisados, feeds podem errar e horários podem mudar. Confirme qualquer coisa que você pretenda operar direto na instituição que divulga — cada evento tem link para a fonte exatamente por isso.

## Licença

[MIT](LICENSE) — **o código**: use, forke, venda, sem exigência além do aviso de licença.

O código de terceiros em [`vendor/`](vendor/) mantém a licença própria: three.js é MIT, Inter e JetBrains Mono são SIL OFL 1.1, com o texto de cada licença ao lado dos arquivos que ela cobre e os três creditados no painel de Fontes do app. O [NOTICE.md](NOTICE.md) é a prestação de contas completa — o que vem junto, o que é buscado e o que você precisa manter ao redistribuir.

**Os dados são outra história.** O orbis não distribui nenhum: o calendário é buscado por você, em tempo de execução, direto dos provedores listados acima, e cada um mantém os direitos que tiver sobre o próprio feed. O `calendar.json` gerado não é coberto por esta licença, não é versionado neste repositório e não é redistribuído por ele. Cada evento aponta de volta para a sua fonte, e o painel de Fontes credita cada provedor pelo nome. A geometria da Natural Earth é domínio público.

Se você redistribuir um fork que já venha com os dados coletados, essa é uma decisão sua com os provedores — não algo que esta licença conceda.
