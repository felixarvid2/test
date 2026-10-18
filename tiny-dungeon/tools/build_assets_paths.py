"""Paths shared by the asset build modules."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # tiny-dungeon/
REPO = os.path.dirname(ROOT)                                                  # /home/user/test
LIB = os.path.join(REPO, 'assets')
TILES_PNG = os.path.join(LIB, '2d-pixel', 'tiny-dungeon', 'Tilemap', 'tilemap_packed.png')
