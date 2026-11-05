# Third-party notices

Tokenopolis has no npm dependencies. It uses the following third-party work.

## Microsoft Rocketbox avatars (redistributed)

The climber models in `public/models/rocketbox/*.glb` are converted from the
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar library
(`Assets/Avatars/Adults`), Copyright (c) 2020 Microsoft, licensed under the MIT License.
The full license text and the list of changes made to the models (metre units, Mixamo bone
names, smaller embedded textures) are in `public/models/rocketbox/LICENSE.md`.

## three.js (loaded from a CDN)

The 3D pages load [three.js](https://threejs.org) r160 and its example modules (OrbitControls,
GLTFLoader, CSS2DRenderer, RoomEnvironment, EffectComposer, RenderPass, UnrealBloomPass, OutputPass,
BufferGeometryUtils, SkeletonUtils, SimplexNoise) from jsDelivr at runtime. three.js is
Copyright © 2010-2026 three.js authors, MIT License. Nothing from three.js is redistributed in
this repository.

## Google Fonts (loaded from a CDN)

The pages load the Nunito and Playfair Display font families from Google Fonts at runtime. Both
are licensed under the SIL Open Font License 1.1. Visitors' browsers contact `fonts.googleapis.com`
and `fonts.gstatic.com`; self-host the fonts if that matters for your deployment.

## Everything else

Textures, sky, buildings, terrain, sounds and UI are generated procedurally by this project's own
code, licensed under the MIT License (see `LICENSE`).
