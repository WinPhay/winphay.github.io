# Why Audio Agents Need Compilers and FFT Telemetry

Most AI audio workflows are black-box diffusion loops: prompt, wait, listen manually, and regenerate everything if bar 12 misses the mark.

[Auralis](https://github.com/Celestrionx/auralis) flips that model into a deterministic **6-crate pure-Rust compiler** (`clap`, `serde`, `serde_json`, `hound`, `rustfft`, `rustysynth`) with zero audio-driver dependencies.

## The Dual-Gate Loop

1. **Gate 1 — Pre-Render Intelligence (`auralis lint`)**: Runs in under `1 ms` on the declarative JSON `Song` manifest before synthesizing a single sample. Flags flat velocities, bare sine oscillators, missing `Pattern`/`Clip` structure, and uncarved sub-bass collisions.
2. **Gate 2 — Post-Render Telemetry (`auralis eval`)**: Analyzes the compiled PCM buffer for peak/RMS dBFS, crest factor, stereo correlation, side-to-mid ratio, and 32-window Hann FFT spectral ratios.

Listen to the compiled `.ogg` showcases directly at [www.celestrionx.com/#demos](https://www.celestrionx.com/#demos).
