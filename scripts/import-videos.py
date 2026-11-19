#!/usr/bin/env python3
"""Import anonymous originals and comparison clips with matching frame windows."""

import argparse
import json
import subprocess
from pathlib import Path

METHODS = {
    "Ground-truth": ("gt", "Ground truth"),
    "Neural-PD": ("ours", "Neural-PD"),
    "obj_dynamics": ("intnet", "InteractionNet"),
    "3DGSIM": ("3dgsim", "3DGSIM"),
    "SGNN": ("sgnn", "SGNN"),
}
SCENES = [
    ("bottle", "Bottle impact", "bottle_shot", ["0041", "0063"],
     "A bottle under impact. Inspect the motion, fragment separation, and damage distribution."),
    ("ball", "Ball–plate impact", "ball_plate_nf", ["0093", "0090", "0094"],
     "A ball impacts a plate at different locations. Inspect the local response and the spread of damage."),
    ("mug", "Mug drop", "pen1e12", ["0014", "0266"],
     "A mug drops onto a surface. Inspect the deformation, contact response, and damage evolution."),
    ("cloth", "Cloth fall", "cloth_fall", ["0832", "0834"],
     "A cloth falls over obstacles. Inspect the evolving shape and the spatial distribution of damage."),
]

# Verified from the frame numbers burned into the supplied renders. Bottle and
# mug baselines start at 010; the other supplied clips start at 000.
BASELINE_OFFSETS = {"bottle": 10, "mug": 10}


def match_frame_window(case, scene_id, root):
    clips = case["clips"]
    for clip in clips:
        clip["firstFrame"] = (BASELINE_OFFSETS.get(scene_id, 0)
                              if clip["method"] not in {"gt", "ours"} else 0)
    fps = clips[0]["fps"]
    if any(clip["fps"] != fps for clip in clips):
        raise ValueError("Frame-window matching requires equal source frame rates.")
    first = max(clip["firstFrame"] for clip in clips)
    last = min(clip["firstFrame"] + clip["frames"] - 1 for clip in clips)
    count = last - first + 1
    if count <= 0:
        raise ValueError("The supplied clips have no overlapping rendered frame numbers.")
    case.update(frameStart=first, frameEnd=last, comparisonFrames=count)
    for clip in clips:
        original = {key: clip[key] for key in ("src", "frames", "duration", "firstFrame")}
        clip["original"] = original
        offset = first - original["firstFrame"]
        source = root / original["src"]
        if offset != 0 or count != original["frames"]:
            comparison = root / "videos" / "comparisons" / source.name
            comparison.parent.mkdir(exist_ok=True)
            # Re-encode exact cuts as standard browser-compatible H.264. No
            # frames are duplicated, interpolated, reordered, or retimed.
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-i", str(source),
                "-map", "0:v:0", "-vf",
                f"trim=start_frame={offset}:end_frame={offset + count},setpts=PTS-STARTPTS",
                "-c:v", "libx264", "-crf", "12", "-preset", "slow", "-threads", "2",
                "-profile:v", "high", "-level:v", "3.1", "-pix_fmt", "yuv420p",
                "-r", str(fps), "-fps_mode", "cfr", "-an",
                "-map_metadata", "-1", "-map_chapters", "-1", "-metadata:s:v:0", "encoder=",
                "-fflags", "+bitexact", "-flags:v", "+bitexact",
                "-movflags", "+faststart", str(comparison),
            ], check=True)
            clip["src"] = comparison.relative_to(root).as_posix()
        clip.update(frames=count, duration=count / fps, firstFrame=first)
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-ss", str(count / fps * 0.6),
            "-i", str(root / clip["src"]), "-frames:v", "1", "-vf", "scale=960:540",
            "-q:v", "3", "-map_metadata", "-1", "-fflags", "+bitexact",
            str(root / clip["poster"]),
        ], check=True)


def run(*args):
    return subprocess.check_output(args, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory containing the model subdirectories")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    destination = root / "videos"
    posters = destination / "posters"
    posters.mkdir(parents=True, exist_ok=True)
    scenes = []
    imported = 0
    for scene_id, label, prefix, examples, description in SCENES:
        scene = dict(id=scene_id, label=label, description=description, examples=[])
        for example in examples:
            case = dict(id=example, clips=[])
            for folder, (method_id, method_label) in METHODS.items():
                suffix = "ground_truth" if method_id == "gt" else "predicted"
                source = args.source / folder / f"{prefix}_{example}_{suffix}.mp4"
                if not source.is_file():
                    continue
                stem = f"{scene_id}_{example}_{method_id}"
                target = destination / f"{stem}.mp4"
                # Stream-copy preserves every encoded frame and the original timing.
                # Discard source titles, chapters, audio, and identifying metadata.
                subprocess.run([
                    "ffmpeg", "-v", "error", "-y", "-i", str(source),
                    "-map", "0:v:0", "-c:v", "copy", "-an", "-map_metadata", "-1",
                    "-map_chapters", "-1", "-metadata:s:v:0", "encoder=",
                    "-fflags", "+bitexact", "-movflags", "+faststart", str(target),
                ], check=True)
                info = json.loads(run("ffprobe", "-v", "error", "-show_streams",
                                      "-show_format", "-of", "json", str(target)))
                video = info["streams"][0]
                duration = float(video["duration"])
                frames = int(video["nb_frames"])
                numerator, denominator = map(int, video["r_frame_rate"].split("/"))
                fps = numerator / denominator
                case["clips"].append(dict(
                    method=method_id, label=method_label, src=f"videos/{stem}.mp4",
                    poster=f"videos/posters/{stem}.jpg", frames=frames, fps=fps,
                    duration=duration, width=video["width"], height=video["height"],
                ))
                imported += 1
            if case["clips"]:
                match_frame_window(case, scene_id, root)
                scene["examples"].append(case)
        if scene["examples"]:
            scenes.append(scene)
    source_videos = set(args.source.glob("*/*.mp4"))
    if imported != len(source_videos):
        raise SystemExit("Unmapped source videos found; update SCENES/METHODS before publishing.")
    manifest = dict(scenes=scenes)
    (root / "static" / "videos.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Imported {imported} videos across {len(scenes)} scenes; matching frame windows generated.")


if __name__ == "__main__":
    main()
