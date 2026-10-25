# Ashfall baked sprites

Pre-rendered 2D sprite sheets of the 3D models from the owner's own game Ashfall
(https://github.com/felixarvid2/Ashfall). The models are `assets/ashfall-ai/meshy/models/**/*.glb`,
generated with Meshy (3D) and textured/rigged there; the ground texture used only in the preview
sheets is FLUX (fal.ai) `assets/ashfall-ai/flux/textures/mine_rock.webp`. All are the owner's own
assets, so no third-party licence or credit applies.

The files here are generated, do not edit them by hand:

```
cd tools/bake && npm install && node bake.mjs     # rewrites art-src/ashfall-baked/<category>/<name>.png|.json
```

See `tools/bake/README.md` for the manifest format and options.
