# Zero-Asset Procedural South Beach in Three.js

This page runs **zero external 3D models (`.glb`) and zero build bundlers**. Every element on the south-facing shoreline is synthesized on the fly in [scene.js](scene.js).

## Compass & Real-Time Astronomy

The camera sits on the sand looking due **South**:

- **Left (`-X`) is East**: Sunrise emerges from the eastern horizon around `05:30` local time.
- **Right (`+X`) is West**: Sunset drops into the western horizon around `18:30` local time.
- **Night Cycle (`19:00–05:30`)**: A procedural lunar disc (`CanvasTexture` with maria shading), `1,350` twinkling stars, and a dynamic beach campfire take over.

## Shader Highlights

1. **Sky Dome**: Analytical zenith-to-horizon gradient plus directional atmospheric glow anchored to the active Sun or Moon vector.
2. **Shoreline Ocean**: Multi-octave vertex wave displacement damped near `z = 0`, analytical ripple normals for Fresnel sky reflections, specular sun/moon glitter paths, and animated surf foam.
3. **Night Campfire**: Stone ring, charred driftwood logs, flickering `PointLight`, additive flame tongues, and 48 rising ember particles that fade down to quiet coals in daylight.

Use the top-right **Time Preview** buttons (`Dawn`, `Noon`, `Dusk`, `Night`, or `Live`) to scrub the full 24-hour cycle at any time.
