# orbis

O calendário econômico do mundo em um globo 3D. Indicadores, decisões de bancos centrais e feriados aparecem no país onde acontecem.

**[Abrir o orbis](https://th3usbit.github.io/orbis/)**. Não precisa de conta nem de chave de API.

![Globo 3D escuro com pilares coloridos nos países com eventos econômicos](https://th3usbit.github.io/orbis/assets/social.png)

## O que ele faz

- Coloca um pilar em cada país com eventos no dia selecionado, com a cor indicando o impacto.
- Mostra os valores efetivo, projetado e anterior de cada indicador.
- Cobre os últimos 7 dias e os próximos 21.
- Filtra por impacto, região e categoria.
- Exporta os eventos em `.csv` ou `.ics`.
- Gera link para uma visão específica: `?d=2026-11-05&c=US` abre esse dia e esse país.
- Está disponível em português, inglês e espanhol.

## Como funciona

Um coletor em Python baixa os calendários públicos, junta os eventos repetidos e grava um único arquivo estático, `data/calendar.json`. O site só lê esse arquivo, por isso não há servidor nem chave de API.

O GitHub Actions refaz e publica o site algumas vezes por dia. Um evento informado por duas fontes independentes ganha a marca ✦.

| Fonte | Usada para |
|---|---|
| [TradingView](https://www.tradingview.com/economic-calendar/) | Calendário principal |
| [ForexFactory](https://www.forexfactory.com/calendar) | Conferência cruzada |
| [Nager.Date](https://date.nager.at) | Feriados |
| [Natural Earth](https://www.naturalearthdata.com/) | Geometria do globo |

O three.js e as fontes tipográficas estão dentro deste repositório, então a página não faz nenhuma requisição a terceiros.

## Rodar na sua máquina

Você precisa do Python 3, testado na versão 3.12. Não há nada para instalar.

```bash
git clone https://github.com/Th3usBit/orbis.git
cd orbis
./start.sh        # no Windows: start.bat
```

A primeira execução precisa de internet para baixar o mapa e o calendário. Depois ela abre `http://127.0.0.1:8080`, ou a próxima porta livre. A partir daí, `./start.sh offline` reaproveita os dados que você já tem.

## Testes

Os testes precisam do Node.js 18 ou mais recente e dos dados gerados, então rode `./start.sh` uma vez antes. Depois:

```bash
node tests/store.test.mjs .
node tests/merge.test.mjs .
```

A lista completa de verificações está no [CONTRIBUTING.md](CONTRIBUTING.md).

## Aviso

O orbis é informativo e não é recomendação de investimento. Cada evento traz o link da instituição que o publicou.

## Licença

O código está sob a licença [MIT](LICENSE). Código, fontes e dados de terceiros seguem os próprios termos, listados no [NOTICE.md](NOTICE.md).
