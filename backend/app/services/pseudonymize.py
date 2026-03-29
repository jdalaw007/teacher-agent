"""
Pseudonymization utilities for GDPR compliance.

Before sending student data to any external AI processor (OpenAI), use these
functions to strip or mask personal identifiers. Real names and emails must
never appear in tool results sent to the LLM — the teacher's own typed messages
may contain names, but system-injected data must not.
"""

import re

# Fields that must never be sent to an external AI processor
_STRIP_FIELDS = ("email", "notes", "classroom_user_id", "updated_at", "created_at")


def safe_student_for_llm(student: dict, include_name: bool = False) -> dict:
    """
    Return a copy of a student record safe to include in an LLM prompt.

    Strips: email, notes, classroom_user_id, timestamps.
    Replaces real name with codename if available — the teacher and AI
    both use the codename, so voice input never needs to reveal real names.
    Set include_name=True only for roster lookups where the LLM needs
    name->ID resolution and the teacher has already typed the name.
    """
    safe = {k: v for k, v in student.items() if k not in _STRIP_FIELDS}
    codename = (student.get("codename") or "").strip()
    if not include_name:
        safe.pop("name", None)
        # Expose codename so the AI can refer to the student by it
        if codename:
            safe["codename"] = codename
    # Add stable opaque reference token
    safe["ref"] = f"st_{student['id']}"
    return safe


# ---------------------------------------------------------------------------
# Health condition keywords (CS + EN)
# Covers GDPR Art. 9 special category — health data must never reach OpenAI.
# Strategy: keyword list, case-insensitive. Czech forms include common
# declined variants since we cannot do full morphological analysis.
# ---------------------------------------------------------------------------
_HEALTH_TERMS = re.compile(
    r"\b("
    # Czech
    r"diabet\w*|cukrovk\w*|cukrovce|rakouvin\w*|rakovin\w*|nádor\w*|tumor\w*"
    r"|leukemi\w*|epilepsi\w*|epileptik\w*|záchvat\w*"
    r"|astma\w*|astmatik\w*|alergi\w*|alergik\w*"
    r"|autis\w*|adhd|dyslexie|dyslexii|dyslektik\w*|dyskalkulie"
    r"|depres\w*|úzkost\w*|anxiet\w*|fobi\w*"
    r"|inzulin\w*|inhalát\w*|inhaler\w*"
    r"|vozík\w*|berle\w*|sluchadl\w*|invalidn\w*"
    r"|psycholog\w*|psychiatr\w*|terapeu\w*"
    # English
    r"|diabetes|cancer|tumou?r|leukemia|epilepsy|seizure\w*"
    r"|asthma|allerg\w*|autism|autistic|adhd|dyslexia|dyslexic|dyscalculia"
    r"|depression|anxiety|phobia|bipolar|schizophreni\w*"
    r"|insulin|inhaler|wheelchair|crutch\w*|hearing.?aid"
    r"|disabled|disability|disorder|syndrome"
    r"|therapist|therapy|psychiatrist|psychologist"
    r")\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Structural frame patterns
# Logic: anchor on the surrounding indicator words and replace the whole
# phrase. Czech declension means we match the FRAME, not the noun itself.
# ---------------------------------------------------------------------------

# Residence location
# CS: "bydlím v Troji", "žiji blízko zoo", "bydlíme u nádraží v Dejvicích"
# EN: "I live near the zoo in Troja", "I live by the hospital"
_LOCATION_RESIDENCE = re.compile(
    r"(bydl\w{1,6}|[žz]iji?|[žz]ijeme|bydl[ií]me|staying|live[sd]?|living)\s+"
    r"(v|ve|u|bl[íi][žz]ko|pobl[íi][žz]|nedaleko|za|pod|nad|na|near|by|next\s+to|close\s+to)\s+"
    r"[\w\s,]{2,40}",
    re.IGNORECASE,
)

# Origin / nationality declaration
# CS: "jsem z Ukrajiny", "pocházím z Polska", "přišel jsem z Ruska"
# EN: "I am from Ukraine", "I come from Syria", "I moved from Vietnam"
_ORIGIN = re.compile(
    r"(jsem\s+z|pocház\w+\s+z|přiš\w+\s+jsem\s+z|přijel\w*\s+z|přijela\w*\s+z"
    r"|I\s+am\s+from|I'?m\s+from|I\s+come\s+from|I\s+moved\s+from|originally\s+from)\s+"
    r"[\w\s]{2,30}",
    re.IGNORECASE,
)

# Nationality adjective declaration
# CS: "jsem Ukrajinec", "jsem Ruska", "jsem Vietnamec"
# EN: "I am Ukrainian", "I am Russian", "I am Syrian"
_NATIONALITY = re.compile(
    r"\b(jsem|I\s+am|I'?m)\s+"
    r"(Afghan\w*|Algerian\w*|American\w*|Arab\w*|Armenian\w*|Azerbaijani\w*"
    r"|Bangladeshi\w*|Belarusian\w*|Bosnian\w*|Brazilian\w*|British\w*|Bulgarian\w*"
    r"|Cambodian\w*|Chinese\w*|Colombian\w*|Croatian\w*|Cuban\w*|Czech\w*"
    r"|Egyptian\w*|Ethiopian\w*|Filipino\w*|French\w*|Georgian\w*|German\w*"
    r"|Greek\w*|Hungarian\w*|Indian\w*|Indonesian\w*|Iranian\w*|Iraqi\w*"
    r"|Israeli\w*|Italian\w*|Japanese\w*|Kazakh\w*|Korean\w*|Kyrgyz\w*"
    r"|Lebanese\w*|Libyan\w*|Lithuanian\w*|Macedonian\w*|Malaysian\w*"
    r"|Mexican\w*|Mongolian\w*|Moroccan\w*|Nigerian\w*|Pakistani\w*"
    r"|Palestinian\w*|Polish\w*|Portuguese\w*|Romanian\w*|Russian\w*"
    r"|Serbian\w*|Slovak\w*|Somali\w*|Spanish\w*|Sri\s+Lankan\w*|Swedish\w*"
    r"|Syrian\w*|Taiwanese\w*|Tajik\w*|Thai\w*|Tunisian\w*|Turkish\w*"
    r"|Turkmen\w*|Ukrainian\w*|Uzbek\w*|Venezuelan\w*|Vietnamese\w*|Yemeni\w*"
    # Czech nationality words (nominative — covers most common forms)
    r"|Afghán\w*|Američan\w*|Arab\w*|Armén\w*|Australan\w*|Azerbajdžán\w*"
    r"|Bangladéšan\w*|Běloruk\w*|Bosňák\w*|Brazilec\w*|Bulhar\w*"
    r"|Číňan\w*|Chorvat\w*|Egypťan\w*|Etiopan\w*|Filipínec\w*"
    r"|Francouz\w*|Gruzínec\w*|Ir\w*|Indián\w*|Ind\w*|Indonésan\w*"
    r"|Íránec\w*|Iráčan\w*|Izraelec\w*|Ital\w*|Japonec\w*|Kazach\w*"
    r"|Kolumbijec\w*|Korejec\w*|Kubánec\w*|Libanonec\w*|Litevec\w*"
    r"|Maďar\w*|Maročan\w*|Mexičan\w*|Mongol\w*|Němec\w*|Nigerijec\w*"
    r"|Nor\w*|Pákistánec\w*|Palestinec\w*|Peruánec\w*|Polák\w*"
    r"|Portugalec\w*|Rumun\w*|Rus\w*|Srb\w*|Somálec\w*|Španěl\w*"
    r"|Švéd\w*|Syřan\w*|Tad[žz]ik\w*|Thajec\w*|Tunisan\w*|Turek\w*"
    r"|Turkmen\w*|Ukrajin\w*|Uzbek\w*|Vietnamec\w*|Jemenit\w*"
    r")\b",
    re.IGNORECASE,
)

# Religion declaration
# CS: "jsem muslim", "jsem křesťan", "jsem žid"
# EN: "I am Muslim", "I am Christian", "I am Jewish"
_RELIGION = re.compile(
    r"\b(jsem|I\s+am|I'?m)\s+"
    r"(muslim\w*|křesťan\w*|christian\w*|žid\w*|jewish|jew\b|katolík\w*|catholic\w*"
    r"|protestant\w*|ateist\w*|atheist\w*|buddhi\w*|hindu\w*|sikh\w*"
    r"|pravoslav\w*|orthodox\w*|evangelík\w*|evangelical\w*"
    r"|svědek\s+jehov\w*|jehov\w*|witness\w*"
    r")\b",
    re.IGNORECASE,
)

# Family member + employer / location
# CS: "máma pracuje v Motole", "táta pracuje na letišti", "rodiče pracují v továrně"
# EN: "my mom works at Motol", "my dad works in a factory"
_FAMILY_EMPLOYER = re.compile(
    r"(m[áa]ma|mamka|matka|t[áa]ta|tat[íi]nek|otec|sestra|bratr|rodi[čc]e|babi[čc]ka|d[eě]da|sourozenci"
    r"|my\s+mom|my\s+mum|my\s+mother|my\s+dad|my\s+father|my\s+sister|my\s+brother"
    r"|my\s+parents|my\s+grandm\w+|my\s+grandfa\w+|my\s+family)\s+"
    r"(pracuje|pracuj[íi]|works?|work|is\s+a|je)\s+"
    r"[\w\s,]{2,40}",
    re.IGNORECASE,
)

# Sports team / club membership
# CS: "hraju za Spartu", "trénuji ve Slavii", "jsem v AC Dejvice"
# EN: "I play for Sparta", "I train at Slavia", "I'm on the school team"
_SPORTS_TEAM = re.compile(
    r"(hraju\s+za|hrám\s+za|trénuji\s+(v|ve|u|pro)|jsem\s+v\s+\w+\s*(FC|AC|SK|TJ|HC|FK)?"
    r"|I\s+play\s+for|I\s+train\s+(at|with|for)|I'?m\s+(on|in)\s+the\s+\w+\s+team"
    r"|I\s+am\s+(on|in)\s+the)\s+"
    r"[\w\s]{2,30}",
    re.IGNORECASE,
)


def scrub_submission_text(text: str, known_names: list[str] | None = None) -> str:
    """
    Scrub a student essay/submission before sending to an external AI processor.

    Pass 1 — Roster names              → [STUDENT_NAME]
    Pass 2 — Emails, phones, URLs      → [EMAIL] / [PHONE] / [URL]
    Pass 3 — Structural frames:
        Residence location             → [LOCATION]
        Origin / nationality           → [ORIGIN]
        Nationality adjective          → [ORIGIN]
        Religion                       → [RELIGION_INFO]
        Family + employer              → [FAMILY_INFO]
        Sports team                    → [TEAM]
    Pass 4 — Health keywords           → [HEALTH_INFO]

    Known limitation: Czech NER is not available as a reliable pretrained
    package. This rule-based approach anchors on structural indicator words
    and replaces the trailing noun phrase. Novel phrasing outside the patterns
    may not be caught. Revisit when a production-quality Czech NER is available.
    """
    if not text:
        return text

    # Pass 1 — known names from class roster (full names + individual parts)
    if known_names:
        name_tokens: set[str] = set()
        for name in known_names:
            name = name.strip()
            if name:
                name_tokens.add(name)
                for part in name.split():
                    if len(part) > 3:
                        name_tokens.add(part)
        for token in sorted(name_tokens, key=len, reverse=True):
            if len(token) > 3:
                text = re.compile(r"\b" + re.escape(token) + r"\b", re.IGNORECASE).sub("[STUDENT_NAME]", text)

    # Pass 2 — structured identifiers
    text = re.sub(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", "[EMAIL]", text)
    text = re.sub(
        r"(\+?\d[\d\s\-().]{6,}\d)",
        lambda m: "[PHONE]" if re.search(r"\d{6,}", m.group().replace(" ", "").replace("-", "")) else m.group(),
        text,
    )
    text = re.sub(r"https?://\S+", "[URL]", text)
    text = re.sub(r"www\.\S+\.\S+", "[URL]", text)

    # Pass 3 — structural frame patterns
    text = _LOCATION_RESIDENCE.sub("[LOCATION]", text)
    text = _ORIGIN.sub("[ORIGIN]", text)
    text = _NATIONALITY.sub(r"\1 [ORIGIN]", text)
    text = _RELIGION.sub(r"\1 [RELIGION_INFO]", text)
    text = _FAMILY_EMPLOYER.sub("[FAMILY_INFO]", text)
    text = _SPORTS_TEAM.sub("[TEAM]", text)

    # Pass 4 — health condition keywords
    text = _HEALTH_TERMS.sub("[HEALTH_INFO]", text)

    return text


def anonymize_text(text: str, students: list[dict]) -> str:
    """
    Replace student real names with their codenames in text before storing
    in memory or sending to an embedding model.

    Falls back to opaque token if student has no codename.
    Only replaces names longer than 3 characters to avoid false positives.
    """
    if not text or not students:
        return text
    for student in students:
        name = (student.get("name") or "").strip()
        codename = (student.get("codename") or "").strip()
        replacement = codename if codename else f"[st_{student['id']}]"
        if len(name) > 3:
            text = text.replace(name, replacement)
    return text
