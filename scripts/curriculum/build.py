"""Собирает базу типовых учебных программ (приказ № 399) из официального текста на ru и kk.

Зачем: модель должна писать объяснения и задания по целям программы своего класса и четверти,
а КСП и слайд «Источники» должны ссылаться на настоящие коды целей. Программы утверждены приказом
министра и по ст. 8 закона об авторском праве не охраняются, поэтому их можно хранить и использовать.

Запуск (только стандартная библиотека Python):
    python3 scripts/curriculum/build.py
Скрипт скачивает приказ на двух языках в .cache/curriculum/ (не в git), разбирает каждую программу
и пишет data/curriculum/index.json и data/curriculum/programs/<id>.json. Повторный запуск берёт кэш.
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "curriculum"
OUT = ROOT / "data" / "curriculum"
SOURCE = {
    "order": "Приказ Министра просвещения РК от 16.09.2022 № 399 (рег. № 29767) с изменениями",
    "ru": "https://zakon.uchet.kz/rus/docs/V2200029767",
    "kk": "https://zakon.uchet.kz/kaz/docs/V2200029767",
    "adilet": "https://adilet.zan.kz/rus/docs/V2200029767",
}
# Код цели: класс.раздел.подраздел.номер, например 2.1.1.1 или 10.4.2.1.
# Часть программ (языки, история, геометрия 10–11) пишет короче: класс.раздел.номер, например 10.1.1.
CODE = re.compile(r"(?<![\d.])(1[01]|[1-9])\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?![\d.])")


def short_code(grades: list[int]) -> re.Pattern:
    """Трёхчастный код принимаем, только если первое число это класс программы."""
    g = "|".join(str(x) for x in sorted(grades, reverse=True)) or "1[01]|[1-9]"
    return re.compile(rf"(?<![\d.])({g})\.(\d{{1,2}})\.(\d{{1,2}})(?![\d.])")


# ---------------------------------------------------------------------------
# 1. HTML → плоский список блоков: ("p", текст) или ("table", [[ячейка, ...], ...])

class Blocks(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list = []
        self.buf: list[str] = []
        self.tables: list[dict] = []
        self.skip = 0

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if not text:
            return
        if self.tables:
            cell = self.tables[-1]["cell"]
            if cell is not None:
                cell.append(text)
        else:
            self.blocks.append(("p", text))

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4"):
            self._flush()
        if tag == "table":
            self._flush()
            self.tables.append({"rows": [], "row": None, "cell": None, "span": 1})
        elif tag == "tr" and self.tables:
            self._flush()
            self.tables[-1]["row"] = []
        elif tag in ("td", "th") and self.tables:
            self._flush()
            t = self.tables[-1]
            if t["row"] is None:
                t["row"] = []
            t["cell"] = []
            t["span"] = int(dict(attrs).get("colspan") or 1)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        if tag in ("p", "div", "li", "h1", "h2", "h3", "h4"):
            self._flush()
        if tag in ("td", "th") and self.tables:
            self._flush()
            t = self.tables[-1]
            if t["cell"] is not None and t["row"] is not None:
                t["row"].append("\n".join(t["cell"]))
                t["row"].extend([""] * (t["span"] - 1))
            t["cell"] = None
        elif tag == "tr" and self.tables:
            self._flush()
            t = self.tables[-1]
            if t["row"]:
                t["rows"].append(t["row"])
            t["row"] = None
        elif tag == "table" and self.tables:
            self._flush()
            t = self.tables.pop()
            if self.tables and self.tables[-1]["cell"] is not None:
                self.tables[-1]["cell"].append(" | ".join(" ".join(r) for r in t["rows"]))
            elif not self.tables:
                self.blocks.append(("table", t["rows"]))

    def handle_data(self, data):
        if not self.skip:
            # Невидимые символы внутри кодов («7.\u200b1.\u200b1.\u200b1») мешают их найти
            data = re.sub("[\u200b\u200c\u200d\u00ad\ufeff]", "", data)
            # В тексте приказа «ё» местами набрана как «Ұ»: «еҰ», «чҰтность». Заглавная Ұ внутри слова
            # после строчной буквы не бывает и в казахском, поэтому замена безопасна.
            data = re.sub(r"(?<=[а-яёәғқңөұүһі])Ұ", "ё", data)
            self.buf.append(data)


def load_blocks(lang: str) -> list:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"order-399.{lang}.html"
    if not path.exists():
        print(f"скачиваю {SOURCE[lang]}", file=sys.stderr)
        req = urllib.request.Request(SOURCE[lang], headers={"User-Agent": "Mozilla/5.0"})
        path.write_bytes(urllib.request.urlopen(req, timeout=300).read())
    parser = Blocks()
    parser.feed(path.read_text(encoding="utf-8", errors="ignore"))
    parser._flush()
    return parser.blocks


# ---------------------------------------------------------------------------
# 2. Делим приказ на программы: каждая начинается с «Глава 1. Общие положения» / «1-тарау. Жалпы ережелер»

START = {"ru": re.compile(r"Глава 1\.\s*Общие положения"), "kk": re.compile(r"1-тарау\.?\s*Жалпы ережелер")}
TITLE = {"ru": re.compile(r"Типовая учебная программа"), "kk": re.compile(r"үлгілік оқу бағдарламасы")}
NOTE = re.compile(r"^(Сноска|Заголовок|Сілтеме|Тақырып|Приложение|Қосымша|\d+-қосымша)", re.I)


def split_programs(blocks: list, lang: str) -> list[dict]:
    starts = [i for i, b in enumerate(blocks) if b[0] == "p" and START[lang].search(b[1])]
    # В русском тексте в начале есть оглавление с теми же заголовками: настоящие программы идут
    # после первого заголовка программы, у которого перед «Главой 1» стоит название программы.
    programs = []
    for n, s in enumerate(starts):
        own = blocks[s][1][: START[lang].search(blocks[s][1]).start()].strip()
        if TITLE[lang].search(own):
            # Название и «Глава 1» в одном абзаце (так почти везде в казахском тексте)
            end = starts[n + 1] if n + 1 < len(starts) else len(blocks)
            programs.append({"title": own, "blocks": blocks[s:end]})
            continue
        title_parts, j = [], s - 1
        while j >= 0 and len(title_parts) < 4 and blocks[j][0] == "p":
            text = blocks[j][1]
            if not NOTE.search(text) and len(text) < 600:
                title_parts.insert(0, text)
                if TITLE[lang].search(text):
                    break
            j -= 1
        title = " ".join(title_parts)
        if not TITLE[lang].search(title):
            continue  # строка оглавления, а не начало программы
        end = starts[n + 1] if n + 1 < len(starts) else len(blocks)
        programs.append({"title": title, "blocks": blocks[s:end]})
    return programs


# ---------------------------------------------------------------------------
# 3. Разбор одной программы

GRADES_RU = re.compile(r"для\s+(\d{1,2})\s*(?:\(\d+\))?\s*(?:-\s*(\d{1,2})\s*(?:\(\d+\))?)?\s*-?\s*класс")
GRADES_KK = re.compile(r"(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*(?:\(\d+\))?\s*-?\s*сынып")
QUARTER = re.compile(r"^\s*(\d)\s*-?\s*(четверть|тоқсан)", re.I)
GRADE_MARK = re.compile(r"^\s*(?:\d\)\s*)?(1[0-2]|[1-9])\s*-?\s*(класс|сынып)\w*\s*:?\s*$", re.I)
PLAN_RU = re.compile(r"Долгосрочный план", re.I)
PLAN_KK = re.compile(r"[Ұұ]зақ мерзімді жоспар", re.I)


def subject_of(title: str) -> str:
    m = re.search(r"[\"«“]([^\"»”]+)[\"»”]", title)
    return m.group(1).strip() if m else title[:80]


def grades_of(title: str, lang: str) -> list[int]:
    m = (GRADES_RU if lang == "ru" else GRADES_KK).search(title)
    if not m:
        return []
    a = int(m.group(1))
    b = int(m.group(2) or a)
    return list(range(a, b + 1)) if a <= b <= 12 else [a]


def variant_of(title: str) -> dict:
    v = {}
    m = re.search(r"\(с ([^()]*?) языком обучения\)", title)
    if m:
        v["instruction"] = m.group(1).strip()
    if "естественно-математическ" in title and "общественно-гуманитарн" in title:
        v["direction"] = "оба направления"
    elif "естественно-математическ" in title:
        v["direction"] = "естественно-математическое"
    elif "общественно-гуманитарн" in title:
        v["direction"] = "общественно-гуманитарное"
    if "сетевых школ" in title:
        v["network"] = "специализированные сетевые школы"
    if "углубленн" in title:
        v["advanced"] = True
    return v


def split_goals(cell: str, code: re.Pattern = CODE) -> list[tuple[str, str]]:
    """Ячейка может содержать несколько целей подряд: «1.1.1.1 текст 1.1.1.2 текст»."""
    # В части программ коды набраны с пробелами: «1. 3. 1. 1» или «1.1. 1.1»
    cell = re.sub(r"(?<=\d)\.\s+(?=\d)", ".", cell)
    found = list(code.finditer(cell))
    out = []
    for k, m in enumerate(found):
        end = found[k + 1].start() if k + 1 < len(found) else len(cell)
        text = cell[m.end():end]
        text = re.sub(r"^[\s*–—\-:.]+", "", text)
        text = re.sub(r"\s+", " ", text).strip(" ;,")
        out.append((m.group(0), text))
    return out


def label_of(cell: str) -> str:
    return re.sub(r"\s+", " ", cell).strip()


def parse_program(prog: dict, lang: str) -> dict:
    blocks = prog["blocks"]
    title = prog["title"]
    plan_re = PLAN_RU if lang == "ru" else PLAN_KK
    # Формат кодов выбираем по программе: четырёхчастные, если они есть, иначе трёхчастные
    cells = [c for kind, item in blocks if kind == "table" for row in item for c in row]
    sample = " ".join(re.sub(r"(?<=\d)\.\s+(?=\d)", ".", c) for c in cells)
    short = short_code(grades_of(title, lang))
    four = len(CODE.findall(sample))
    three = len(short.findall(sample))
    # Берём формат, которого больше: в части программ среди трёхчастных кодов попадаются опечатки из четырёх чисел
    code_re = CODE if four >= three else short

    # Часы в неделю и в год по классам
    hours = {}
    for kind, text in blocks:
        if kind != "p":
            continue
        for m in re.finditer(r"(?:в\s+)?(1[0-2]|[1-9])\s*-?\s*(?:классе|сыныпта)\s*[-–—:]?\s*(\d+(?:[.,]\d+)?)\s*(?:час|сағат)\w*\s*(?:в неделю|аптасына)?[^;.\d]*?(\d+(?:[.,]\d+)?)\s*(?:час|сағат)", text):
            hours.setdefault(m.group(1), {"week": float(m.group(2).replace(",", ".")), "year": float(m.group(3).replace(",", "."))})

    # Базовое содержание по классам
    content: dict[str, list[str]] = {}
    current = None
    for kind, text in blocks:
        if kind != "p":
            current = None
            continue
        head = re.search(r"(Базовое содержание|базалық мазмұны|Базалық мазмұны)", text)
        if head:
            g = re.search(r"(1[0-2]|[1-9])\s*-?\s*(класс|сынып)", text)
            current = g.group(1) if g else None
            rest = text[text.find(":") + 1:].strip() if ":" in text else ""
            if current:
                content.setdefault(current, [])
                if len(rest) > 20:
                    content[current].append(rest)
            continue
        if current and re.match(r"^\d+\)\s", text):
            content[current].append(text)
        elif current and re.match(r"^(\d+\.\s|Параграф|Глава|\d+-тарау|\d+-параграф)", text):
            current = None

    # Цели: канонический текст берём из «системы целей» (до долгосрочного плана)
    goals: dict[str, dict] = {}
    sections: dict[str, str] = {}
    subsections: dict[str, str] = {}
    in_plan = False
    plan: dict[str, list] = {}
    grade_mark = None
    for kind, item in blocks:
        if kind == "p":
            if plan_re.search(item) and len(item) < 400:
                in_plan = True
            m = GRADE_MARK.match(item)
            if m:
                grade_mark = m.group(1)
            continue
        rows = item
        if not in_plan:
            for row in rows:
                first = label_of(row[0]) if row else ""
                sec = re.match(r"^(Раздел|Бөлім)\s*(\d+)\s*[:.]?\s*(.*)$", first)
                if sec and not CODE.search(first):
                    sections[sec.group(2)] = sec.group(3).strip()
                sub = re.match(r"^(\d{1,2})\.(\d{1,2})\.?\s+(.+)$", first)
                if sub and len(first) < 150 and not code_re.match(first):
                    subsections[f"{sub.group(1)}.{sub.group(2)}"] = sub.group(3).strip()
                row_codes = []
                for cell in row:
                    for code, text in split_goals(cell, code_re):
                        row_codes.append(code)
                        if code not in goals and text:
                            goals[code] = {"text": text}
                # Раздел без номера в первой колонке (например «Кинематика» у физики 10–11)
                if first and len(first) < 150 and not code_re.search(first) and row_codes and not sub and not sec:
                    key = ".".join(row_codes[0].split(".")[1:3])
                    subsections.setdefault(key, first)
            continue
        # Долгосрочный план: строки выравниваем вправо, недостающие левые ячейки берём из прошлой строки
        width = max((len(r) for r in rows), default=0)
        carry = [""] * width
        quarter = None
        header_seen = False
        for row in rows:
            cells = [label_of(c) for c in row]
            joined = " ".join(cells)
            q = QUARTER.match(cells[0]) if cells else None
            if q and not code_re.search(joined):
                quarter = int(q.group(1))
                carry = [""] * width
                continue
            gm = GRADE_MARK.match(joined)
            if gm and not code_re.search(joined):
                grade_mark = gm.group(1)
                continue
            if not header_seen and not code_re.search(joined):
                header_seen = True
                continue
            padded = [""] * (width - len(cells)) + cells
            for k in range(width):
                if padded[k]:
                    carry[k] = padded[k]
                elif k < width - len(cells):
                    padded[k] = carry[k]
            codes, labels = [], []
            for k, cell in enumerate(padded):
                found = split_goals(cell, code_re)
                if found:
                    for code, text in found:
                        codes.append(code)
                        if code not in goals and text:
                            goals[code] = {"text": text}
                elif cell and not QUARTER.match(cell):
                    labels.append(cell)
            if not codes:
                continue
            grade = grade_mark or codes[0].split(".")[0]
            plan.setdefault(grade, []).append({"quarter": quarter, "labels": labels, "goals": codes})

    for code, g in goals.items():
        parts = code.split(".")
        grade, sec = parts[0], parts[1]
        sub = parts[2] if len(parts) == 4 else ""
        g["grade"] = int(grade)
        if sec in sections:
            g["section"] = sections[sec]
        if f"{sec}.{sub}" in subsections:
            g["subsection"] = subsections[f"{sec}.{sub}"]

    # Склеиваем соседние строки плана одного раздела и четверти
    merged: dict[str, list] = {}
    for grade, rows in plan.items():
        out = []
        for r in rows:
            key = (r["quarter"], tuple(r["labels"][:2]))
            if out and (out[-1]["quarter"], tuple(out[-1]["labels"][:2])) == key:
                out[-1]["goals"] += [c for c in r["goals"] if c not in out[-1]["goals"]]
            else:
                out.append({"quarter": r["quarter"], "labels": r["labels"], "goals": list(dict.fromkeys(r["goals"]))})
        merged[grade] = out

    return {
        "title": title,
        "subject": subject_of(title),
        "grades": grades_of(title, lang),
        "variant": variant_of(title) if lang == "ru" else {},
        "hours": hours,
        "content": content,
        "goals": dict(sorted(goals.items(), key=lambda kv: [int(x) for x in kv[0].split(".")])),
        "plan": merged,
    }


# ---------------------------------------------------------------------------
# 4. ru + kk: пара находится по совпадению кодов целей (порядок программ в двух текстах разный)

TRANSLIT = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "i",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f",
    "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "ә": "a", "ғ": "g", "қ": "q", "ң": "n", "ө": "o", "ұ": "u", "ү": "u", "һ": "h", "і": "i",
})


def slug(text: str) -> str:
    s = text.lower().translate(TRANSLIT)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def program_id(p: dict) -> str:
    g = p["grades"]
    grades = f"{g[0]}-{g[-1]}" if len(g) > 1 else (str(g[0]) if g else "x")
    parts = [slug(p["subject"]), grades]
    v = p["variant"]
    if v.get("instruction"):
        parts.append(slug(v["instruction"]))
    if v.get("direction"):
        parts.append({"естественно-математическое": "em", "общественно-гуманитарное": "og", "оба направления": "em-og"}[v["direction"]])
    if v.get("network"):
        parts.append("network")
    if v.get("advanced"):
        parts.append("adv")
    return "-".join(parts)


INSTRUCTION_KK = {"казахским": "қазақ", "русским": "орыс", "уйгурским": "ұйғыр", "узбекским": "өзбек",
                  "таджикским": "тәжік", "таджикском": "тәжік"}


def same_instruction(ru: dict, kk: dict) -> int:
    """+1, если язык обучения в названиях совпадает, −1, если разный, 0, если сравнить нельзя."""
    want = INSTRUCTION_KK.get(ru["variant"].get("instruction", ""))
    got = re.search(r"оқыту\s+(\S+)\s+тілінде", kk["title"])
    if not want or not got:
        return 0
    return 1 if got.group(1).lower().startswith(want) else -1


def match_kk(ru: dict, kk_list: list[dict], used: set, ru_pos: float) -> dict | None:
    """Пара на казахском: совпадение кодов целей и место программы в приказе.

    У программ казахского, уйгурского, узбекского и таджикского языка коды целей одинаковые,
    поэтому одних кодов мало: при равном совпадении берём программу с того же места в приказе
    (порядок программ в двух текстах почти одинаковый).
    """
    best, score, j_best = None, -1.0, 0.0
    a = set(ru["goals"])
    if not a:
        return None
    for n, kk in enumerate(kk_list):
        if n in used:
            continue
        b = set(kk["goals"])
        if not b or same_instruction(ru, kk) < 0:
            continue  # другой язык обучения: лучше без перевода, чем с чужим
        j = len(a & b) / len(a | b)
        distance = abs(ru_pos - n / max(1, len(kk_list) - 1))
        value = j - 0.5 * distance + 0.3 * same_instruction(ru, kk)
        if value > score:
            best, score, j_best = n, value, j
    if best is not None and j_best >= 0.6:
        used.add(best)
        return kk_list[best]
    return None


def main() -> None:
    parsed = {}
    for lang in ("ru", "kk"):
        blocks = load_blocks(lang)
        parsed[lang] = [parse_program(p, lang) for p in split_programs(blocks, lang)]
        print(f"{lang}: программ {len(parsed[lang])}", file=sys.stderr)

    (OUT / "programs").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "programs").glob("*.json"):
        old.unlink()
    index, used, seen = [], set(), {}
    for n_ru, ru in enumerate(parsed["ru"]):
        kk = match_kk(ru, parsed["kk"], used, n_ru / max(1, len(parsed["ru"]) - 1))
        pid = program_id(ru)
        if pid in seen:
            seen[pid] += 1
            pid = f"{pid}-{seen[pid]}"
        else:
            seen[pid] = 1
        goals, warnings = {}, []
        for code, g in ru["goals"].items():
            if ru["grades"] and g["grade"] not in ru["grades"]:
                # Опечатка в тексте приказа (например, 10.4.9.1 в программе 5–9 классов): не берём, но показываем
                warnings.append(f"код {code} не относится к классам программы: {g['text'][:80]}")
                continue
            item = {"grade": g["grade"], "ru": g["text"]}
            if kk and code in kk["goals"]:
                item["kk"] = kk["goals"][code]["text"]
            for key in ("section", "subsection"):
                if key in g:
                    item[key] = g[key]
            goals[code] = item
        plan = {}
        for grade, rows in ru["plan"].items():
            kk_rows = (kk or {}).get("plan", {}).get(grade, [])
            out = []
            for n, r in enumerate(rows):
                unknown = [c for c in r["goals"] if c not in goals]
                warnings += [f"в плане {grade} класса код {c}, которого нет в системе целей" for c in unknown]
                known = [c for c in r["goals"] if c in goals]
                if not known:
                    continue
                row = {"quarter": r["quarter"], "ru": r["labels"], "goals": known}
                twin = next((k for k in kk_rows if k["goals"] == r["goals"]), None)
                if twin:
                    row["kk"] = twin["labels"]
                out.append(row)
            plan[grade] = out
        program = {
            "id": pid,
            "subject": {"ru": ru["subject"], "kk": kk["subject"] if kk else None},
            "title": {"ru": ru["title"], "kk": kk["title"] if kk else None},
            "grades": ru["grades"],
            "variant": ru["variant"],
            "hours": ru["hours"],
            "content": {"ru": ru["content"], "kk": kk["content"] if kk else {}},
            "goals": goals,
            "plan": plan,
            "warnings": warnings,
            "source": SOURCE,
        }
        (OUT / "programs" / f"{pid}.json").write_text(json.dumps(program, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        kk_goals = sum(1 for g in goals.values() if "kk" in g)
        plan_rows = sum(len(v) for v in plan.values())
        plan_codes = {c for rows in plan.values() for r in rows for c in r["goals"]}
        index.append({
            "id": pid,
            "subject": program["subject"],
            "grades": ru["grades"],
            "variant": ru["variant"],
            "goals": len(goals),
            "goals_kk": kk_goals,
            "plan_rows": plan_rows,
            "plan_quarters": sorted({r["quarter"] for rows in plan.values() for r in rows if r["quarter"]}),
            "plan_codes_known": round(len(plan_codes & set(goals)) / len(plan_codes), 3) if plan_codes else None,
            "content_grades": sorted(ru["content"], key=int),
            "warnings": len(warnings),
            "hours": ru["hours"],
        })
    (OUT / "index.json").write_text(json.dumps({"source": SOURCE, "programs": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"записано программ: {len(index)} → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
