"""
Student codename system for privacy-safe voice input.

Each student gets a stable animal codename derived from the first letter of
their last name. The animal is in the teacher's selected UI language so they
can speak it naturally without revealing the student's real name to Google's
speech transcription servers.

Collision handling: if two students share the same first letter, the second
gets a numbered suffix (e.g. "Falcon", "Falcon 2", "Falcon 3").
"""

import unicodedata

# Animal lists indexed by uppercase ASCII letter A-Z.
# Each language provides one animal per letter starting with that letter.
_ANIMALS: dict[str, dict[str, str]] = {
    "English": {
        "A": "Antelope", "B": "Bear",      "C": "Cheetah",    "D": "Dolphin",
        "E": "Eagle",    "F": "Falcon",    "G": "Gorilla",    "H": "Hawk",
        "I": "Ibis",     "J": "Jaguar",    "K": "Koala",      "L": "Lynx",
        "M": "Meerkat",  "N": "Narwhal",   "O": "Otter",      "P": "Panther",
        "Q": "Quail",    "R": "Raven",     "S": "Salamander", "T": "Tiger",
        "U": "Uakari",   "V": "Vulture",   "W": "Wolf",       "X": "Xenops",
        "Y": "Yak",      "Z": "Zebra",
    },
    "Czech": {
        "A": "Antilopa", "B": "Bobr",      "C": "Cikáda",     "D": "Delfín",
        "E": "Emu",      "F": "Fretka",    "G": "Gorila",     "H": "Hroch",
        "I": "Ibis",     "J": "Jestřáb",   "K": "Koala",      "L": "Liška",
        "M": "Medvěd",   "N": "Nosorožec", "O": "Orel",       "P": "Panda",
        "Q": "Quetzal",  "R": "Rys",       "S": "Sova",       "T": "Tygr",
        "U": "Užovka",   "V": "Vlk",       "W": "Wombat",     "X": "Xenops",
        "Y": "Yak",      "Z": "Zebra",
    },
    "Spanish": {
        "A": "Antílope", "B": "Búho",      "C": "Cóndor",     "D": "Delfín",
        "E": "Elefante", "F": "Flamenco",  "G": "Gorila",     "H": "Halcón",
        "I": "Iguana",   "J": "Jaguar",    "K": "Koala",      "L": "Lince",
        "M": "Manatí",   "N": "Narval",    "O": "Orca",       "P": "Pantera",
        "Q": "Quetzal",  "R": "Rinoceronte", "S": "Salamandra", "T": "Tigre",
        "U": "Urraca",   "V": "Visón",     "W": "Wombat",     "X": "Xenops",
        "Y": "Yak",      "Z": "Zorro",
    },
    "French": {
        "A": "Autruche", "B": "Bison",     "C": "Condor",     "D": "Dauphin",
        "E": "Élan",     "F": "Faucon",    "G": "Gorille",    "H": "Hibou",
        "I": "Ibis",     "J": "Jaguar",    "K": "Koala",      "L": "Lynx",
        "M": "Marmotte", "N": "Narval",    "O": "Orque",      "P": "Panthère",
        "Q": "Quetzal",  "R": "Renard",    "S": "Salamandre", "T": "Tigre",
        "U": "Urubu",    "V": "Vautour",   "W": "Wombat",     "X": "Xenops",
        "Y": "Yak",      "Z": "Zèbre",
    },
    "Russian": {
        "A": "Антилопа", "B": "Бобёр",    "C": "Сурок",      "D": "Дельфин",
        "E": "Енот",     "F": "Фламинго", "G": "Горилла",    "H": "Хомяк",
        "I": "Ибис",     "J": "Ягуар",    "K": "Коала",      "L": "Лиса",
        "M": "Медведь",  "N": "Нарвал",   "O": "Орёл",       "P": "Пантера",
        "Q": "Квезаль",  "R": "Рысь",     "S": "Сова",       "T": "Тигр",
        "U": "Утка",     "V": "Волк",     "W": "Вомбат",     "X": "Ксенопс",
        "Y": "Як",       "Z": "Зебра",
    },
}

_FALLBACK = _ANIMALS["English"]


def _first_ascii_letter(name: str) -> str:
    """
    Return the uppercase ASCII letter for the first character of a name,
    stripping diacritics. E.g. 'Šimůnek' -> 'S', 'Dvořák' -> 'D'.
    Falls back to 'A' if no ASCII letter found.
    """
    normalized = unicodedata.normalize("NFD", name)
    for ch in normalized:
        ascii_ch = unicodedata.normalize("NFC", ch)
        if ascii_ch.isalpha():
            try:
                ascii_ch.encode("ascii")
                return ascii_ch.upper()
            except UnicodeEncodeError:
                continue
    return "A"


def _base_animal(last_name: str, language: str) -> str:
    letter = _first_ascii_letter(last_name)
    animals = _ANIMALS.get(language, _FALLBACK)
    return animals.get(letter, _FALLBACK.get(letter, "Animal"))


def assign_codename(last_name: str, language: str, existing_codenames: list[str]) -> str:
    """
    Generate a unique codename for a student given their last name, the
    teacher's language, and the list of codenames already assigned in this class.

    Returns e.g. "Falcon", "Falcon 2", "Falcon 3".
    """
    base = _base_animal(last_name, language)
    if base not in existing_codenames:
        return base
    n = 2
    while f"{base} {n}" in existing_codenames:
        n += 1
    return f"{base} {n}"


def get_animals_for_language(language: str) -> dict[str, str]:
    """Return the full A-Z animal map for a given language."""
    return _ANIMALS.get(language, _FALLBACK)
