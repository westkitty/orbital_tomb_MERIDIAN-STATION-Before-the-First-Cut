# Asset receipt

## Sources consulted

The original brief and its linked Meridian station-state contract, visual locks, Tiger visual canon, Chapel/geometry references, and finale v02 references were consulted during the build. The source contracts supplied the story timing, station proportions, twelve-arm starting state, named crew/landmarks, Chapel bay/pane count, major system failures, and canonical Tiger silhouette constraints.

## What ships

- All visible art in `src/render.js` is newly authored Canvas 2D vector/gradient artwork. It is a clean, stylized proxy—not a texture, screenshot, frame trace, render, or conversion of a Drive asset.
- The same proxy station persists across shots: an 8.7 km ring proportion, central spire, lower spine, twelve fixed docking arms at the start, and steel-blue Virgil. The observation room keeps three canted bays with two panes each.
- The Tiger proxy is deliberate and backlit, with pupil-less cyan eyes and a mineral-point grin; it has no anatomical nose or rendered teeth. The canon's 9 ft / 2.7432 m height takes precedence over the conflicting 3.05 m value in the state JSON, but the 2D drawing does not claim a physical scale calibration.
- Rin, Mara, Hesh, Kira, Jalen, Safi, the survivor, and background crew are symbolic original vector figures. Their exact approved likenesses are not asserted.
- No private Drive files, signed URLs, production audio, secrets, `.blend`/`.fbx` source, or unrelated project material are included. The only audio is optional, synthesized nonverbal oscillator/filter ambience generated at runtime.

## Remaining verification gaps

The code-level proxies follow the written facts above, but they are not validated against the original publishable binary references. Exact Meridian surface motifs and scale detailing, Chapel v003 PBR/material response, approved crew facial/body likeness, and the finale v02 camera/plate specifics remain unverified. In particular, the Pages build is a stylized 2D study and must not be described as a photorealistic 3D asset recreation.
