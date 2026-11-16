# Anonymous project page

A static page for sharing the paper's videos during double-blind review. Plain HTML, CSS and JavaScript: no build step, no external fonts, scripts, analytics or embeds.

## Files

```
index.html        page text (title, abstract, captions, links)
static/style.css  look
static/main.js    dataset tabs, video loading, comparison slider
videos/           the .mp4 files
```

## Adding videos

Every video box is a placeholder showing the file name it expects. Put a file with that name in `videos/` and it appears in place of the placeholder, playing muted and looping.

- Rollouts: `videos/<dataset>_<method>.mp4`, for example `ball_gt.mp4`, `ball_ours.mp4`, `ball_intnet.mp4`, `ball_3dgsim.mp4`, `ball_sgnn.mp4`. Datasets are `ball`, `bullet`, `mug`, `bottle`, `crack`. To add, remove or rename datasets or methods, edit the two lists at the top of `static/main.js`.
- Others: `teaser.mp4`, `damage_gt.mp4`, `damage_ours.mp4` (the comparison slider), `failure_1.mp4` to `failure_3.mp4`.

Convert each video before adding it. This compresses it, makes it play in every browser, removes audio, and strips metadata (which can contain usernames, paths or software info):

```bash
ffmpeg -i input.mp4 -map_metadata -1 -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart -an videos/ball_ours.mp4
```

Keep each file well under 100 MB (GitHub's per-file limit); under about 25 MB loads quickly.

## Preview locally

Videos only load when the page is served, not when `index.html` is opened directly:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## Publishing on GitHub Pages

1. Create a new GitHub account that is not linked to any author (new email, neutral username).
2. Create a public repository and upload these files, or push them with git after setting an anonymous identity in this folder:
   ```bash
   git config user.name "Anonymous"
   git config user.email "<the new account's email>"
   ```
3. Repository Settings → Pages → Source: deploy from branch `main`, folder `/ (root)`.
4. The page appears at `https://<username>.github.io/<repository>/` within a minute or two.

## Anonymity checklist

- No author names, affiliations, lab names, acknowledgements or grant numbers anywhere: page text, file names, video frames, axis labels.
- Videos converted with the command above (metadata removed); no usernames, file paths or desktop clutter visible in frames.
- Commits made under the anonymous identity only (`git log` shows no real names or emails).
- No analytics, trackers, YouTube or Vimeo embeds, or externally hosted fonts or scripts. ICLR requires that linked pages do not track visitors.
- Links in the buttons point only to anonymous destinations (OpenReview, anonymized code).
