# Gaussian Splatting Lab

An interactive browser-based experiment exploring Gaussian point-sprite rendering with **Three.js and custom GLSL shaders**. Built as an educational graphics demo to understand the basic visual effect of soft Gaussian primitives and transparency, not as a full 3D Gaussian Splatting (3DGS) implementation.

## Live demo

**Add your Vercel URL here after deploying.**

## Run locally

```bash
npm install
npm run dev
```

Visit the local URL printed by Vite. Build for deployment with `npm run build`.

## Features

- Three procedurally generated 3D scenes with deterministic point positions.
- Compare **hard-edged point sprites** and **Gaussian-opacity point sprites** using the same geometry, side by side.
- Custom GLSL vertex and fragment shaders, including camera-dependent point size and `exp(-4.5 * r²)` alpha falloff.
- Controls for Gaussian size, opacity, primitive count, and palette.
- Approximate **back-to-front per-point sorting** before normal alpha blending.
- Live frame-rate and approximate frame-time readouts.

## How it works

Each primitive has a 3D center position, RGB color, and radius. The vertex shader projects each position and produces a screen-facing sprite. The fragment shader measures the distance `r` from the sprite center in local normalized sprite coordinates and evaluates:

```
alpha(r) = peakOpacity * exp(-4.5 * r²)
```

Pixels outside the sprite's circular footprint or with negligible alpha are discarded. Sprites use standard source-over alpha blending. Because Three.js does not automatically sort the individual points inside a `THREE.Points` object, this demo performs a per-point camera-depth sort approximately every 150 ms while the camera is moving.

In **Compare** mode, the viewport is rendered in two scissored regions using the same camera and identical underlying primitives. Points mode changes the fragment coverage and draws smaller hard-edged markers, making the difference in representation visible.

## What this is *not*

This project does **not** reconstruct a scene from photos or implement production 3D Gaussian Splatting. In particular it does not:

- Fit or optimize Gaussians from multi-view imagery.
- Store anisotropic 3D covariance matrices or project them as oriented 2D ellipses.
- Use view-dependent spherical-harmonic colors.
- Implement tile-based splat rasterization or a GPU radix sorter.
- Provide a rigorous GPU profiling benchmark; the frame-time indicator is a frame interval approximation, not GPU timing.

These are natural directions for further work. In a full 3DGS renderer, a 3D covariance matrix is projected into screen space (via the camera Jacobian), and resulting ellipses are blended in approximate depth order.

## Technical decisions and trade-offs

| Choice | Reason | Limitation |
|---|---|---|
| GLSL `gl_PointCoord` | Simple, accessible demo of Gaussian opacity kernels | Only isotropic screen-aligned sprites |
| CPU point sorting | Makes alpha compositing more credible than arbitrary buffer order | CPU + buffer-upload overhead, approximate update cadence |
| Procedural scenes | Reproducible, quick to run, no large asset download | Not a real reconstructed capture |
| WebGL + Three.js | Browser accessibility for recruiters and reviewers | Doesn't demonstrate a dedicated high-performance 3DGS pipeline |

## Development notes

Core implementation is in [`src/main.js`](src/main.js). Visual styles are in [`src/style.css`](src/style.css).

## References

- Kerbl et al., *3D Gaussian Splatting for Real-Time Radiance Field Rendering* (SIGGRAPH 2023): https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- Three.js documentation: https://threejs.org/docs/
