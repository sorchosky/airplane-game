# Fake camera clip

`flight.mp4` is a real front-camera clip (17 s, 720x480, about 0.8 MB): walk in, T-pose, tilts,
arms up, arms down. `tests/e2e/fakeCameraClip.spec.ts` converts it to `.y4m` at test time and feeds
it to Chromium with `--use-file-for-fake-video-capture`, so camera, MediaPipe, gestures and flight
all run on real pixels. Needs `ffmpeg` on the PATH (preinstalled on GitHub's ubuntu runners). The
spec skips with a message if the clip or ffmpeg is missing.

The converted `.y4m` is about 117 MB, so it is not committed.

## Replace the clip

Record landscape on the phone's front camera, about 2 m away, with your whole arm span inside the
frame (the current clip is too close, see the `fixme` in the spec). Then trim and shrink it:

```
ffmpeg -i IMG_0000.MOV -ss 0 -t 20 -vf "scale=640:480,fps=15" -an -crf 30 flight.mp4
```

Keep it under a few MB. To check the conversion by hand:

```
ffmpeg -i flight.mp4 -vf "scale=640:480,fps=15" -pix_fmt yuv420p flight.y4m
```
