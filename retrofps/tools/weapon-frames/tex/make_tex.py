# Version 6: omfärgad colormap för spikgeväret (Kenney Blaster Kit 2.1, CC0) – leksaksfärgerna blir rostigt industrijärn.
#   python3 tex/make_tex.py   (från tools/weapon-frames)
import numpy as np
from PIL import Image
SRC = '../../../assets/3d-models/blaster-kit_2.1/Models/GLB format/Textures/colormap.png'
MAP = {(56, 56, 61): (22, 20, 22), (82, 75, 94): (46, 42, 40), (79, 82, 96): (54, 52, 52),
       (97, 203, 139): (84, 46, 30),      # grön kropp -> mörkt olivjärn
       (103, 148, 217): (72, 74, 78), (168, 120, 232): (88, 80, 74), (243, 120, 240): (120, 70, 50),
       (255, 126, 68): (150, 72, 40), (207, 83, 79): (120, 50, 36), (176, 96, 65): (104, 60, 40),
       (241, 151, 108): (164, 104, 60), (242, 191, 153): (178, 140, 90), (253, 228, 199): (196, 170, 120),
       (255, 192, 68): (176, 132, 56),     # gul -> mässing
       (134, 139, 161): (40, 38, 38), (160, 168, 201): (48, 46, 44), (208, 232, 255): (58, 54, 48),
       (255, 255, 255): (70, 64, 56)}
a = np.array(Image.open(SRC).convert('RGB')).astype(int)
out = a.copy()
g = a.mean(axis=2, keepdims=True)
out[:] = (g * 0.6).astype(int)                 # allt annat: avmättat och lite mörkare
for s, d in MAP.items():
    m = (a[:, :, 0] == s[0]) & (a[:, :, 1] == s[1]) & (a[:, :, 2] == s[2])
    out[m] = d
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('tex/blaster_industrial.png')
print('ok')
