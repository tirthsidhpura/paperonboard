"""Extract explicit academic period and subject labels from GTU PDF text."""
import re

ROMAN = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}
def parse_header(text):
    text = text[:4500].replace('\ufffd', '-').replace('\u2013', '-').replace('\u2014', '-')
    header = re.split(r'Subject\s*(?:Code|Name|Title)\s*:', text, maxsplit=1, flags=re.I)[0]
    match = re.search(r'\b(SEMESTER|SEM\.?|YEAR)\s*[-:]?\s*([IVX]+|\d{1,2})(?:\b|\s)', header, re.I)
    if not match:
        match = re.search(r'\b([IVX]+|\d{1,2})\s*(?:st|nd|rd|th)?\s+(YEAR)\b', header, re.I)
        if match: kind, number = match[2], match[1]
        else:
            words = {'FIRST': '1', 'SECOND': '2', 'THIRD': '3', 'FOURTH': '4', 'FIFTH': '5', 'SIXTH': '6'}
            match = re.search(r'\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+(YEAR|SEMESTER)\b', header, re.I)
            if not match: return None
            kind, number = match[2], words[match[1].upper()]
    else: kind, number = match[1], match[2]
    number = ROMAN.get(number.upper(), int(number) if number.isdigit() else 0)
    if not 1 <= number <= 12: return None
    name = re.search(r'(?:Subject\s*(?:Name|Title)|Name\s*of\s*(?:the\s*)?Subject)\s*[:\-]\s*(.+?)(?=\s*(?:Date\s*:|Time\s*:|Total\s*Marks|Instructions|Subject\s*Code))', text, re.I | re.S)
    if not name:
        name = re.search(r'Subject\s*[:\-]\s*(.+?)(?=\s*(?:Date\s*:|Time\s*:|Total\s*Marks|Instructions))', text, re.I | re.S)
    if not name: return None
    name = re.sub(r'\s+', ' ', name[1]).strip(' :-')
    if not 2 <= len(name) <= 220 or 'Q.1' in name: return None
    return {'periodType': 'year' if kind.upper() == 'YEAR' else 'semester', 'period': number, 'name': name}
