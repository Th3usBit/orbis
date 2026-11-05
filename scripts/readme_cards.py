"""Os cards animados do README, desenhados a partir do calendário coletado.

Cada número que o README mostra sai daqui, do data/calendar.json que o deploy
acabou de gerar: quantos eventos, de quantos países, qual fonte trouxe o quê,
como a carga se distribui na janela. Nada é digitado à mão, então nada
envelhece -- o card é refeito a cada deploy, junto com o site.

    python scripts/readme_cards.py [raiz do repo] [pasta de saída]

Só biblioteca padrão, como o resto do coletor. A saída é SVG com animação em
CSS e SMIL, porque é o único formato animado que o GitHub exibe num README
sem JavaScript e sem perder nitidez em nenhuma tela.

Movimento com motivo: as barras crescem uma vez até o valor real, os números
rolam até o total real, as partículas do fluxo saem de cada fonte em
proporção ao que ela entregou, e só o que é agora -- o dia de hoje -- pulsa.
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / "assets" / "readme"

# Os mesmos tokens de css/orbis.css. O card é um pedaço do produto, não um
# material de marketing com paleta própria.
BG = "#05070c"
PANEL = "#0a0e17"
LINE = "#1a2333"
INK = "#dbe3f0"
STRONG = "#f4f7fc"
DIM = "#7f8ea6"
ACCENT = "#4da3ff"
UP = "#3ddc97"
IMPACT = {3: "#ff4d6d", 2: "#ffb347", 1: "#6c8cb5", 0: "#8b7bd8"}
IMPACT_PT = {3: "Alto", 2: "Médio", 1: "Baixo", 0: "Feriado"}

CATEGORIES_PT = {
    "rates": "Política monetária", "inflation": "Inflação", "growth": "Atividade",
    "labor": "Trabalho", "trade": "Comércio", "housing": "Imobiliário",
    "sentiment": "Confiança", "fiscal": "Fiscal", "energy": "Energia",
    "bonds": "Títulos", "money": "Agregados monetários", "speech": "Discursos",
    "holiday": "Feriados", "other": "Outros",
}
WEEKDAY_PT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

# Sem fonte web: um SVG aberto como <img> não carrega nada de fora. A pilha
# cai na fonte de sistema de cada plataforma, e os números ficam em mono.
SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

BASE_CSS = f"""
  .sans {{ font-family: {SANS}; }}
  .mono {{ font-family: {MONO}; }}
  .cap {{ font-family: {SANS}; font-size: 11px; letter-spacing: .14em; fill: {DIM}; text-transform: uppercase; }}
  .fade {{ animation: fade .9s ease-out both; }}
  @keyframes fade {{ from {{ opacity: 0; transform: translateY(6px); }} to {{ opacity: 1; transform: none; }} }}
  @keyframes pulse {{ 0% {{ transform: scale(.4); opacity: .9; }} 100% {{ transform: scale(1.9); opacity: 0; }} }}
  .pulse {{ transform-box: fill-box; transform-origin: center; animation: pulse 2.4s ease-out infinite; }}
  @media (prefers-reduced-motion: reduce) {{
    * {{ animation: none !important; }}
  }}
"""


def fmt(n: int) -> str:
    """2054 -> '2.054', no jeito brasileiro."""
    return f"{n:,}".replace(",", ".")


def svg(width: int, height: int, body: str, css: str = "", title: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{escape(title)}">'
        f"<title>{escape(title)}</title>"
        f"<style>{BASE_CSS}{css}</style>"
        f'<rect width="{width}" height="{height}" rx="18" fill="{BG}"/>'
        f'<rect x=".5" y=".5" width="{width - 1}" height="{height - 1}" rx="17.5" fill="none" stroke="{LINE}"/>'
        f"{body}</svg>\n"
    )


def date_pt(d: datetime) -> str:
    return f"{d.day:02d} {MONTH_PT[d.month - 1]}"


# --- 1. os números ----------------------------------------------------------


def odometer(x: float, y: float, value: str, size: int, color: str, delay: float) -> tuple[str, set[int]]:
    """Um número que rola até o valor real, dígito por dígito.

    Cada dígito é uma coluna 0-9 repetida duas vezes dentro de uma máscara; a
    coluna sobe até parar no dígito certo, e a da direita para por último,
    como num contador mecânico. Pontos de milhar não rolam.
    """
    char_w = size * 0.6
    line_h = size * 1.15
    parts = []
    used: set[int] = set()
    cx = x
    digits = [c for c in value if c.isdigit()]
    seen = 0
    for c in value:
        if not c.isdigit():
            parts.append(f'<text x="{cx:.1f}" y="{y:.1f}" class="mono" font-size="{size}" fill="{color}">{c}</text>')
            cx += char_w * 0.55
            continue
        d = int(c)
        used.add(d)
        seen += 1
        column = "".join(
            f'<text x="{cx:.1f}" y="{y + k * line_h:.1f}" class="mono" font-size="{size}" fill="{color}">{k % 10}</text>'
            for k in range(20)
        )
        lag = delay + 0.12 * seen
        parts.append(
            f'<g clip-path="url(#clip{int(x)}_{int(y)})">'
            f'<g class="roll d{d}" style="animation-delay:{lag:.2f}s">{column}</g></g>'
        )
        cx += char_w
    clip = (
        f'<clipPath id="clip{int(x)}_{int(y)}"><rect x="{x - 2:.1f}" y="{y - size * 0.95:.1f}" '
        f'width="{cx - x + 4:.1f}" height="{size * 1.2:.1f}"/></clipPath>'
    )
    return clip + "".join(parts), used


def card_numbers(data: dict) -> str:
    stats = data["stats"]
    high = stats["by_impact"].get("3", 0)
    corroborated = sum(1 for e in data["events"] if e.get("confirmed_by"))
    sources_ok = sum(1 for s in data["sources"] if s.get("ok"))
    metrics = [
        ("eventos na janela", stats["total"], STRONG),
        ("países e blocos", stats["countries"], STRONG),
        ("alto impacto", high, IMPACT[3]),
        ("fontes no ar", sources_ok, UP),
        ("confirmados ✦", corroborated, ACCENT),
    ]
    width, height = 960, 210
    size = 46
    line_h = size * 1.15
    col = (width - 80) / len(metrics)
    body = []
    used: set[int] = set()
    for i, (label, value, color) in enumerate(metrics):
        x = 40 + i * col
        body.append(f'<text x="{x:.1f}" y="62" class="cap fade" style="animation-delay:{0.1 * i:.1f}s">{escape(label)}</text>')
        group, digits = odometer(x, 122, fmt(value), size, color, 0.2 + 0.15 * i)
        used |= digits
        body.append(group)
        if i:
            body.append(f'<line x1="{x - 18:.1f}" y1="44" x2="{x - 18:.1f}" y2="134" stroke="{LINE}"/>')

    generated = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
    start = datetime.fromisoformat(data["window"]["from"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(data["window"]["to"].replace("Z", "+00:00")) - timedelta(days=1)
    body.append(f'<line x1="40" y1="160" x2="{width - 40}" y2="160" stroke="{LINE}"/>')
    body.append(f'<circle cx="48" cy="184" r="4" fill="{UP}"/><circle cx="48" cy="184" r="4" fill="{UP}" class="pulse"/>')
    body.append(
        f'<text x="62" y="188" class="sans" font-size="13" fill="{INK}">coletado em '
        f'<tspan fill="{STRONG}" font-weight="600">{date_pt(generated)} {generated.year} · '
        f'{generated:%H:%M} UTC</tspan>'
        f'<tspan fill="{DIM}">  ·  janela de {date_pt(start)} a {date_pt(end)}  ·  refeito a cada deploy</tspan></text>'
    )
    css = "".join(
        # O valor final é o estado padrão; a animação só traz do zero até ele.
        # Com "reduzir movimento" a animação some, e o que fica é o número
        # certo -- não uma fileira de zeros, como no primeiro desenho.
        f"@keyframes r{d}{{from{{transform:translateY(0)}}}}"
        f".d{d}{{transform:translateY(-{(10 + d) * line_h:.1f}px);animation:r{d} 2.2s cubic-bezier(.16,.84,.24,1) backwards}}"
        for d in sorted(used)
    )
    return svg(width, height, "".join(body), css, f"orbis agora: {fmt(data['stats']['total'])} eventos de {data['stats']['countries']} países")


# --- 2. o fluxo -------------------------------------------------------------


def card_flow(data: dict, size_kb: int) -> str:
    """Fontes → reconciliação → um arquivo → o navegador, com o volume real."""
    width, height = 960, 340
    sources = {s["id"]: s for s in data["sources"]}
    corroborated = sum(1 for e in data["events"] if e.get("confirmed_by"))
    rows = [
        ("tradingview", "TradingView", "primária · ~80 países", IMPACT[3]),
        ("forexfactory", "ForexFactory", "conferência cruzada", IMPACT[2]),
        ("nager", "Nager.Date", "feriados de mercado", IMPACT[0]),
    ]
    body = [f'<text x="40" y="42" class="cap">o caminho de um dado, com os volumes desta coleta</text>']
    paths = []
    merge_x, merge_y = 400, 180
    for i, (sid, name, role, color) in enumerate(rows):
        y = 92 + i * 82
        count = sources.get(sid, {}).get("events", 0)
        ok = sources.get(sid, {}).get("ok", False)
        body.append(
            f'<g class="fade" style="animation-delay:{0.1 * i:.1f}s">'
            f'<rect x="40" y="{y - 28}" width="210" height="58" rx="10" fill="{PANEL}" stroke="{LINE}"/>'
            f'<circle cx="58" cy="{y - 8}" r="4" fill="{UP if ok else IMPACT[3]}"/>'
            f'<text x="70" y="{y - 3}" class="sans" font-size="14" font-weight="600" fill="{STRONG}">{name}</text>'
            f'<text x="58" y="{y + 18}" class="sans" font-size="11.5" fill="{DIM}">{role}</text>'
            f'<text x="236" y="{y - 3}" text-anchor="end" class="mono" font-size="13" fill="{color}">{fmt(count)}</text>'
            "</g>"
        )
        d = f"M250 {y} C 320 {y}, 330 {merge_y}, {merge_x - 70} {merge_y}"
        body.append(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
        # Partículas em proporção (logarítmica) ao que a fonte entregou: a
        # primária é um rio, a de feriados é um gotejar.
        n = max(1, round(math.log10(max(count, 1)) * 2.2))
        dur = 2.6
        for k in range(n):
            paths.append(
                f'<circle r="2.6" fill="{color}"><animateMotion dur="{dur}s" repeatCount="indefinite" '
                f'begin="{k * dur / n:.2f}s" path="{d}"/></circle>'
            )

    # reconciliação
    body.append(
        f'<g class="fade" style="animation-delay:.4s">'
        f'<rect x="{merge_x - 70}" y="{merge_y - 44}" width="170" height="88" rx="12" fill="{PANEL}" stroke="{ACCENT}" stroke-opacity=".55"/>'
        f'<text x="{merge_x + 15}" y="{merge_y - 14}" text-anchor="middle" class="mono" font-size="15" fill="{STRONG}">merge()</text>'
        f'<text x="{merge_x + 15}" y="{merge_y + 8}" text-anchor="middle" class="sans" font-size="11.5" fill="{DIM}">reconcilia, não empilha</text>'
        f'<text x="{merge_x + 15}" y="{merge_y + 28}" text-anchor="middle" class="sans" font-size="12" fill="{ACCENT}">{fmt(corroborated)} confirmados ✦</text>'
        "</g>"
    )
    # arquivo
    jx = 620
    d2 = f"M{merge_x + 100} {merge_y} L {jx - 60} {merge_y}"
    body.append(f'<path d="{d2}" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
    body.append(
        f'<g class="fade" style="animation-delay:.6s">'
        f'<rect x="{jx - 60}" y="{merge_y - 44}" width="150" height="88" rx="12" fill="{PANEL}" stroke="{LINE}"/>'
        f'<text x="{jx + 15}" y="{merge_y - 14}" text-anchor="middle" class="mono" font-size="13.5" fill="{STRONG}">calendar.json</text>'
        f'<text x="{jx + 15}" y="{merge_y + 8}" text-anchor="middle" class="sans" font-size="11.5" fill="{DIM}">um arquivo estático</text>'
        f'<text x="{jx + 15}" y="{merge_y + 28}" text-anchor="middle" class="mono" font-size="12" fill="{INK}">{fmt(data["stats"]["total"])} · {size_kb} KB</text>'
        "</g>"
    )
    # navegador, com um globo de verdade em miniatura: o terminador na
    # posição do sol no momento da coleta.
    bx, by, r = 840, merge_y, 58
    d3 = f"M{jx + 90} {merge_y} L {bx - r - 8} {merge_y}"
    body.append(f'<path d="{d3}" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
    generated = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
    hours = generated.hour + generated.minute / 60
    sub_lon = (12 - hours) * 15  # longitude subsolar, sem a equação do tempo
    shift = ((sub_lon + 180) % 360 - 180) / 90 * r
    body.append(
        f'<defs><radialGradient id="gl" cx="35%" cy="35%" r="75%"><stop offset="0" stop-color="#1c4f86"/>'
        f'<stop offset="1" stop-color="#071a30"/></radialGradient>'
        f'<clipPath id="disc"><circle cx="{bx}" cy="{by}" r="{r}"/></clipPath>'
        f'<radialGradient id="atmo" r=".5"><stop offset=".78" stop-color="{ACCENT}" stop-opacity="0"/>'
        f'<stop offset=".9" stop-color="{ACCENT}" stop-opacity=".35"/><stop offset="1" stop-color="{ACCENT}" stop-opacity="0"/></radialGradient></defs>'
        f'<g class="fade" style="animation-delay:.8s">'
        f'<circle cx="{bx}" cy="{by}" r="{r * 1.28:.1f}" fill="url(#atmo)"/>'
        f'<circle cx="{bx}" cy="{by}" r="{r}" fill="url(#gl)"/>'
        f'<g clip-path="url(#disc)"><ellipse cx="{bx + shift:.1f}" cy="{by}" rx="{r:.1f}" ry="{r * 1.3:.1f}" fill="#000" opacity=".55">'
        f'<animate attributeName="cx" values="{bx + shift + r * 2.2:.1f};{bx + shift:.1f}" dur="2.4s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1"/></ellipse></g>'
        f'<circle cx="{bx}" cy="{by}" r="{r}" fill="none" stroke="{ACCENT}" stroke-opacity=".4"/>'
        f'<text x="{bx}" y="{by + r + 28}" text-anchor="middle" class="sans" font-size="13" font-weight="600" fill="{STRONG}">seu navegador</text>'
        f'<text x="{bx}" y="{by + r + 46}" text-anchor="middle" class="sans" font-size="11.5" fill="{DIM}">globo 3D · zero requisições a terceiros</text>'
        "</g>"
    )
    for k in range(4):
        for d, dur in ((d2, 1.1), (d3, 1.3)):
            paths.append(
                f'<circle r="2.6" fill="{ACCENT}"><animateMotion dur="{dur}s" repeatCount="indefinite" '
                f'begin="{k * dur / 4:.2f}s" path="{d}"/></circle>'
            )
    body.append(
        f'<text x="{(jx + 90 + bx - r) / 2:.0f}" y="{merge_y - 14}" text-anchor="middle" class="sans" font-size="11" fill="{DIM}">GitHub Pages</text>'
        f'<text x="{(merge_x + 100 + jx - 60) / 2:.0f}" y="{merge_y - 14}" text-anchor="middle" class="sans" font-size="11" fill="{DIM}">Python</text>'
    )
    body.append(
        f'<text x="40" y="{height - 26}" class="sans" font-size="12" fill="{DIM}">'
        "Nenhum feed gratuito libera CORS. Então o coletor roda fora do navegador, e a página só lê um arquivo: "
        f'<tspan fill="{INK}">sem servidor, sem chave, sem custo.</tspan></text>'
    )
    return svg(width, height, "".join(body) + "".join(paths), "", "Fluxo de dados do orbis")


# --- 3. a agenda ------------------------------------------------------------


def card_agenda(data: dict) -> str:
    """A janela inteira, dia a dia, empilhada por impacto."""
    start = datetime.fromisoformat(data["window"]["from"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(data["window"]["to"].replace("Z", "+00:00"))
    generated = datetime.fromisoformat(data["generated_at"].replace("Z", "+00:00"))
    days = []
    d = start
    while d < end:
        days.append(d.date())
        d += timedelta(days=1)
    load: dict = defaultdict(Counter)
    for e in data["events"]:
        load[e["ts"][:10]][e.get("impact", 1)] += 1

    width, height = 960, 316
    left, right, top, base = 40, 40, 82, 236
    slot = (width - left - right) / len(days)
    bar = slot * 0.62
    peak = max(sum(load[x.isoformat()].values()) for x in days) or 1
    busiest = max(days, key=lambda x: sum(load[x.isoformat()].values()))
    today = generated.date()

    body = [f'<text x="{left}" y="42" class="cap">a agenda da janela · eventos por dia, empilhados por impacto (UTC)</text>']
    bx = width - right - 4 * 76
    for imp in (3, 2, 1, 0):
        body.append(f'<rect x="{bx + 12}" y="54" width="9" height="9" rx="2" fill="{IMPACT[imp]}"/>'
                    f'<text x="{bx + 26}" y="62.5" class="sans" font-size="11" fill="{DIM}">{IMPACT_PT[imp]}</text>')
        bx += 76
    for i, day in enumerate(days):
        x = left + i * slot + (slot - bar) / 2
        c = load[day.isoformat()]
        y = base
        parts = []
        for imp in (1, 2, 3, 0):
            n = c.get(imp, 0)
            if not n:
                continue
            h = (base - top - 10) * n / peak
            y -= h
            parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar:.1f}" height="{max(h - 1, 0.8):.1f}" rx="1.5" fill="{IMPACT[imp]}"/>')
        body.append(f'<g class="grow" style="animation-delay:{0.03 * i:.2f}s">{"".join(parts)}</g>')
        is_today = day == today
        wd = WEEKDAY_PT[day.weekday()]
        tone = STRONG if is_today else (DIM if day.weekday() < 5 else "#4c5870")
        body.append(f'<text x="{x + bar / 2:.1f}" y="{base + 20}" text-anchor="middle" class="mono" font-size="11" fill="{tone}">{day.day}</text>')
        body.append(f'<text x="{x + bar / 2:.1f}" y="{base + 34}" text-anchor="middle" class="sans" font-size="9" fill="{tone}">{wd}</text>')
        if is_today:
            body.append(
                f'<rect x="{x - 4:.1f}" y="{top - 6}" width="{bar + 8:.1f}" height="{base - top + 46}" rx="6" fill="none" stroke="{ACCENT}" stroke-opacity=".7"/>'
                f'<circle cx="{x + bar / 2:.1f}" cy="{top - 6}" r="4" fill="{ACCENT}"/>'
                f'<circle cx="{x + bar / 2:.1f}" cy="{top - 6}" r="4" fill="{ACCENT}" class="pulse"/>'
            )
    total_busy = sum(load[busiest.isoformat()].values())
    body.append(
        f'<text x="{left}" y="{height - 18}" class="sans" font-size="12" fill="{DIM}">dia mais carregado: '
        f'<tspan fill="{STRONG}">{WEEKDAY_PT[busiest.weekday()]} {busiest.day:02d} {MONTH_PT[busiest.month - 1]} · {total_busy} eventos</tspan>'
        f'   ·   o contorno azul é hoje</text>'
    )
    css = (
        ".grow{transform-box:fill-box;transform-origin:50% 100%;animation:grow 1.1s cubic-bezier(.2,.8,.2,1) both}"
        "@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}"
    )
    return svg(width, height, "".join(body), css, "Agenda econômica da janela, por dia e impacto")


def place_label(x, y, r, name, n, taken, marks):
    """Um rótulo onde ele não pisa em outro, ou nenhum rótulo.

    A Europa concentra uma dúzia de calendários em poucos graus, e o
    primeiro desenho empilhou Reino Unido, Zona do Euro e Alemanha um sobre o
    outro. Tenta direita, esquerda, acima e abaixo, com uma linha-guia quando
    o rótulo se afasta, e desiste antes de cobrir um texto já posto.
    """
    text = f"{name} {n}"
    w = 7.0 * len(text) + 4
    h = 15
    options = [
        (x + r + 6, y + 4, "start", None),
        (x - r - 6, y + 4, "end", None),
        (x, y - r - 30, "middle", (x, y - r)),
        (x, y + r + 34, "middle", (x, y + r)),
        (x + r + 40, y - r - 22, "start", (x + r * .7, y - r * .7)),
        (x - r - 40, y - r - 22, "end", (x - r * .7, y - r * .7)),
    ]
    for tx, ty, anchor, lead in options:
        left = tx - (w if anchor == "end" else w / 2 if anchor == "middle" else 0)
        box = (left, ty - 12, left + w, ty - 12 + h)
        if box[0] < 34 or box[2] > 926:
            continue
        if any(not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]) for b in taken):
            continue
        taken.append(box)
        line = ""
        if lead:
            lx = tx if anchor != "end" else tx
            line = (f'<line x1="{lead[0]:.1f}" y1="{lead[1]:.1f}" x2="{lx:.1f}" y2="{ty + (-14 if ty < y else -10):.1f}" '
                    f'stroke="{DIM}" stroke-opacity=".6"/>')
        return (
            f'<g class="fade" style="animation-delay:1.2s">{line}'
            f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{anchor}" class="sans" font-size="12" fill="{STRONG}" '
            f'paint-order="stroke" stroke="{BG}" stroke-width="3">'
            f'{escape(name)} <tspan class="mono" fill="{DIM}">{n}</tspan></text></g>'
        )
    return ""


# --- 4. o mapa --------------------------------------------------------------


def card_map(data: dict, countries: dict) -> str:
    """O planeta aberto num retângulo, com cada país do tamanho da sua agenda."""
    width, height = 960, 470
    lat_top, lat_bottom = 82, -58
    mx, my, mw, mh = 30, 60, width - 60, 360

    def project(lat: float, lon: float) -> tuple[float, float]:
        return mx + (lon + 180) / 360 * mw, my + (lat_top - lat) / (lat_top - lat_bottom) * mh

    dots_file = ROOT / "assets" / "land-dots.json"
    body = [f'<text x="40" y="42" class="cap">onde a agenda está · cada círculo é um país, do tamanho do seu calendário</text>']
    if dots_file.exists():
        raw = json.loads(dots_file.read_text(encoding="utf-8"))
        scale = raw.get("scale", 100)
        grid = 2.4
        cells = {
            (round(la / scale / grid), round(lo / scale / grid))
            for la, lo in zip(raw["lat"], raw["lon"])
            if lat_bottom <= la / scale <= lat_top
        }
        dots = []
        for la, lo in sorted(cells):
            x, y = project(la * grid, lo * grid)
            dots.append(f"M{x:.1f} {y:.1f}h0")
        body.append(
            f'<path d="{"".join(dots)}" stroke="#2a4a6e" stroke-width="3.2" stroke-linecap="round" fill="none" class="fade"/>'
        )

    per = Counter(e["country"] for e in data["events"])
    high = Counter(e["country"] for e in data["events"] if e.get("impact") == 3)
    top = max(per.values()) if per else 1
    ranked = per.most_common()
    labels = {code for code, _ in ranked[:9]}
    marks, rings, texts = [], [], []
    taken: list[tuple[float, float, float, float]] = []
    marks_xy: list[tuple[float, float, float]] = []
    for i, (code, n) in enumerate(sorted(ranked, key=lambda kv: -kv[1])):
        info = countries.get(code)
        if not info:
            continue
        x, y = project(info["lat"], info["lon"])
        r = 2.5 + 15 * math.sqrt(n / top)
        color = IMPACT[3] if high.get(code) else (IMPACT[2] if n > 15 else IMPACT[1])
        marks.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}" fill-opacity=".28" stroke="{color}" '
            f'stroke-width="1.2" class="pop" style="animation-delay:{0.5 + 0.02 * i:.2f}s"/>'
        )
        if high.get(code, 0) >= 5:
            rings.append(
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="none" stroke="{color}" stroke-width="1.4" '
                f'class="pulse" style="animation-delay:{(i % 5) * 0.45:.2f}s"/>'
            )
        if code in labels:
            placed = place_label(x, y, r, info.get("name_pt") or info.get("name_en") or code, n, taken, marks_xy)
            if placed:
                texts.append(placed)
        marks_xy.append((x, y, r))
    body += marks + rings + texts
    body.append(
        f'<circle cx="46" cy="{height - 22}" r="5" fill="{IMPACT[3]}" fill-opacity=".3" stroke="{IMPACT[3]}"/>'
        f'<text x="58" y="{height - 18}" class="sans" font-size="12" fill="{DIM}">tem evento de alto impacto na janela  ·  '
        f'o anel pulsa onde há 5 ou mais  ·  {len(per)} países no total</text>'
    )
    css = (
        ".pop{transform-box:fill-box;transform-origin:center;animation:pop .7s cubic-bezier(.2,1.4,.4,1) both}"
        "@keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}"
    )
    return svg(width, height, "".join(body), css, "Mapa dos países com eventos econômicos")


# --- 5. as categorias -------------------------------------------------------


def card_categories(data: dict) -> str:
    cats = sorted(data["stats"]["by_category"].items(), key=lambda kv: -kv[1])
    row = 25
    width, height = 960, 70 + row * len(cats) + 20
    left_label, bar_x, bar_w = 40, 230, 620
    peak = cats[0][1] if cats else 1
    total = sum(n for _, n in cats) or 1
    body = [f'<text x="40" y="42" class="cap">do que é feita a semana · eventos por categoria</text>']
    for i, (cat, n) in enumerate(cats):
        y = 72 + i * row
        w = bar_w * n / peak
        color = IMPACT[0] if cat == "holiday" else (DIM if cat == "other" else ACCENT)
        body.append(
            f'<text x="{left_label}" y="{y + 4}" class="sans" font-size="13" fill="{INK}">{escape(CATEGORIES_PT.get(cat, cat))}</text>'
            f'<rect x="{bar_x}" y="{y - 7}" width="{bar_w}" height="12" rx="6" fill="{PANEL}"/>'
            f'<rect x="{bar_x}" y="{y - 7}" width="{w:.1f}" height="12" rx="6" fill="{color}" fill-opacity=".85" class="bar" style="animation-delay:{0.05 * i:.2f}s"/>'
            f'<text x="{width - 40}" y="{y + 4}" text-anchor="end" class="mono" font-size="12" fill="{STRONG}">{fmt(n)}'
            f'<tspan fill="{DIM}"> · {100 * n / total:.0f}%</tspan></text>'
        )
    css = (
        ".bar{transform-box:fill-box;transform-origin:0 50%;animation:bar 1.2s cubic-bezier(.2,.8,.2,1) both}"
        "@keyframes bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}"
    )
    return svg(width, height, "".join(body), css, "Eventos por categoria")


def main() -> int:
    calendar = ROOT / "data" / "calendar.json"
    if not calendar.exists():
        print("  SKIP  data/calendar.json não existe; rode scripts/fetch.py antes.")
        return 0
    data = json.loads(calendar.read_text(encoding="utf-8"))
    countries = json.loads((ROOT / "data" / "countries.json").read_text(encoding="utf-8"))["countries"]
    size_kb = round(calendar.stat().st_size / 1024)

    OUT.mkdir(parents=True, exist_ok=True)
    cards = {
        "numeros.svg": card_numbers(data),
        "fluxo.svg": card_flow(data, size_kb),
        "agenda.svg": card_agenda(data),
        "mapa.svg": card_map(data, countries),
        "categorias.svg": card_categories(data),
    }
    for name, content in cards.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print(f"  wrote {(OUT / name).relative_to(ROOT)} ({len(content.encode()) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
