#!/bin/sh
# Ljud för biomer, fotsteg, sparken och bossmusiken -> retrofps/assets/snd (mono ogg).
# Källor: assets/audio (Kenney CC0, 400 Sounds Pack CC0, Abstraction Music Loop Bundle CC0)
# och Horror SFX Free ur releasen assets-large-v1 (packa upp den i $HORROR).
# Kör från repo-roten: HORROR=/sökväg/till/"Horror SFX Free" sh retrofps/tools/sounds/make.sh
set -e
O=retrofps/assets/snd
S="assets/audio/400 Sounds Pack"
I=assets/audio/impact-sounds/Audio
H="${HORROR:?ange HORROR}"
conv() { ffmpeg -loglevel error -y -i "$1" -ac 1 -ar 22050 ${3:-} -c:a libvorbis -q:a 2 "$O/$2.ogg"; }
conv "$S/Environment/ambient_wind.wav" amb_wind
conv "$S/Environment/water_dripping.wav" amb_drip
conv "$H/Ambient/Rain_Medium_2.wav" amb_rain "-t 20"
conv "$H/Ambient/Frogs.wav" amb_frogs "-t 20"
conv "$H/Ambient/Creepy_ambience_3.wav" amb_creepy "-t 25"
conv "$H/Ambient/Bell_low.wav" bell
conv "$H/Monsters & Ghosts/Ghost_moan_2.wav" moan
conv "$H/Character/Gasp.wav" gasp
conv "$S/Combat and Gore/kick.wav" kick
conv "$S/Combat and Gore/bone_snap.wav" bonesnap
conv "$I/footstep_grass_000.ogg" step_grass
conv "$S/Footsteps/foley_footstep_gravel_2.wav" step_gravel
conv "$I/footstep_wood_001.ogg" step_wood
conv "$S/Items/gem_collect.wav" gem
conv "$S/Environment/water_splashing.wav" splash
# bossmusik: en mörk slinga
conv "assets/audio/music-loop-bundle-2026-q2/Week 19 - Dark Portents SHROUDED FUTURE.ogg" music_boss "-q:a 1"
# hjärtslag: två låga dunsar, syntetiserade
ffmpeg -loglevel error -y -f lavfi -i "sine=f=55:d=0.9" -af "volume='if(lt(t,0.09),1,if(lt(t,0.25),0,if(lt(t,0.34),0.8,0)))':eval=frame,lowpass=f=180" -ac 1 -ar 22050 -c:a libvorbis -q:a 2 "$O/heart.ogg"
ls -la $O | tail -20
