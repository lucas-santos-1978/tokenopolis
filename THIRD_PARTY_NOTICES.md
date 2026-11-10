# Third-party notices

Tokenopolis has no npm dependencies. It uses the following third-party work.

## Microsoft Rocketbox avatars (redistributed)

The climber models in `public/models/rocketbox/*.glb` are converted from the
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar library
(`Assets/Avatars/Adults`), Copyright (c) 2020 Microsoft, licensed under the MIT License.
The full license text and the list of changes made to the models (metre units, Mixamo bone
names, smaller embedded textures) are in `public/models/rocketbox/LICENSE.md`.

## three.js (bundled)

The 3D pages use [three.js](https://threejs.org) r160 and some of its example modules (OrbitControls,
CSS2DRenderer, RoomEnvironment, GLTFLoader, EffectComposer and its passes, BufferGeometryUtils,
SkeletonUtils, SimplexNoise). They are served from `public/vendor/three/`, unmodified, so the panel
works on a network that blocks outside sites. three.js is Copyright © 2010-2023 three.js authors,
MIT License; the license text is in `public/vendor/three/LICENSE`.

## Google Fonts (loaded from a CDN)

The pages load the Nunito and Playfair Display font families from Google Fonts at runtime. Both
are licensed under the SIL Open Font License 1.1. Visitors' browsers contact `fonts.googleapis.com`
and `fonts.gstatic.com`; self-host the fonts if that matters for your deployment.

## Everything else

Textures, sky, buildings, terrain, sounds and UI are generated procedurally by this project's own
code, licensed under the MIT License (see `LICENSE`).
