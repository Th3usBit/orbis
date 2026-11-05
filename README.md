<div align="center">

# orbis

**O calendário econômico mundial, num globo 3D.**

Indicadores, decisões de bancos centrais e feriados de mercado de mais de 70 países,<br>
com o dia e a noite na posição real do sol. Grátis, sem cadastro e sem chave de API.

**[Abrir o orbis →](https://th3usbit.github.io/orbis/)**

<br>

<a href="https://th3usbit.github.io/orbis/"><img src="https://th3usbit.github.io/orbis/assets/readme/globo.webp" width="100%" alt="O orbis em uso: alguém gira o globo 3D, com pilares nos países que têm eventos econômicos, a lista de eventos à direita e a linha do tempo embaixo"></a>

</div>

## O que ele faz

- **Mostra onde a agenda está.** Cada país com evento no dia ganha um pilar, com altura e cor pelo impacto.
- **Mostra quem está acordado.** O terminador dia/noite é calculado pela posição real do sol.
- **Mostra a semana antes de ela começar.** Uma linha do tempo com quatro semanas, empilhadas por impacto.
- **Filtra o que importa.** Por impacto, região e categoria, com o globo e a lista andando juntos.
- **Cruza fontes.** Eventos confirmados por dois feeds independentes ganham a marca ✦.
- **Vai com você.** Exporta para `.csv` e `.ics`, gera links compartilháveis e funciona em português, inglês e espanhol, até offline.

## Rodar localmente

```bash
git clone https://github.com/Th3usBit/orbis.git
cd orbis
./start.sh        # no Windows: start.bat
```

O único requisito é o Python 3.9+, sem nenhum `pip install`. A primeira execução baixa os dados públicos e abre `http://127.0.0.1:8080`.

## Como funciona

Um coletor em Python (só biblioteca padrão) busca [TradingView](https://www.tradingview.com/economic-calendar/), [ForexFactory](https://www.forexfactory.com/calendar) e [Nager.Date](https://date.nager.at), reconcilia tudo em um único `calendar.json` estático, e o GitHub Pages serve o site. Não há servidor, chave de API nem dado no repositório: um robô reconstrói tudo a cada poucas horas.

O front-end é JavaScript puro com [three.js](https://threejs.org/), empacotado no próprio repositório. A página não faz nenhuma requisição a terceiros.

## Licença

[MIT](LICENSE). Ferramenta informativa, **não é recomendação de investimento**. Cada evento tem o link da instituição que o publicou.
