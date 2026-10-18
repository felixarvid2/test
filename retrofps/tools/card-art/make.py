#!/usr/bin/env python3
"""Kortbilder för de 50 nya korten (96x96 RGB, samma format som de övriga i assets/cards).

Varje kort är en relikbild ur assets/rune-ai/flux/relics (512x512 webp) som skalas ned hel
med Lanczos, precis som de ursprungliga korten (t.ex. askkungen.png). Kortets id är
relikbildens namn, så tabellen nedan är bara listan över vilka reliker som används.
Kör från repo-roten: python3 retrofps/tools/card-art/make.py .
"""
import os
import sys
from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
RELICS = os.path.join(ROOT, 'assets/rune-ai/flux/relics')
OUT = os.path.join(ROOT, 'retrofps/assets/cards')
S = 96

CARDS = [  # kort-id = relikbild
    # vanliga
    'fyllbulten', 'fyrfoten', 'hornstenen', 'agget', 'benflojt', 'hangande_lappen', 'gronskan', 'att_gora',
    'grodan', 'halvmane', 'dominobrickan', 'sollinsen', 'glasogat', 'akrobaten', 'urtidsrunan', 'fyrkanten',
    'idolen', 'moln_nio', 'askstav', 'feltrycket',
    # ovanliga
    'spakvinnan', 'kristallkronan', 'tankestormen', 'inbrottstjuven', 'snedsteget', 'spakortet', 'avtrycket',
    'tomrummet', 'trubaduren', 'lyckokatten', 'sigillbrevet', 'rotknuta', 'schablonen', 'maskerna', 'baronen',
    # sällsynta
    'vandringsstaven', 'bryggan', 'kubtornet', 'spadomskulan', 'glad_trefot', 'pirathatten', 'horisonten',
    'runsten', 'eremiten', 'snedkronet',
    # legendariska
    'prismakronan', 'gryningen', 'travstaven', 'brokiga', 'ansiktslos',
]


def main():
    assert len(CARDS) == len(set(CARDS)) == 50, len(CARDS)
    for cid in CARDS:
        im = Image.open(os.path.join(RELICS, cid + '.webp')).convert('RGB')
        im.resize((S, S), Image.LANCZOS).save(os.path.join(OUT, cid + '.png'))
    print(len(CARDS), 'kortbilder ->', OUT)


if __name__ == '__main__':
    main()
