const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { scenes: [], scene: null, example: null, player: null, inView: false, overlay: false };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Every method in an example uses the same rendered frame window at 1×.
// Comparison exports retain the selected frame sequence without padded frames.
class ComparisonPlayer {
  constructor(records) {
    this.records = records;
    this.fps = records[0].clip.fps;
    this.frames = records[0].clip.frames;
    this.firstFrame = records[0].clip.firstFrame;
    if (records.some(({ clip }) => clip.fps !== this.fps || clip.frames !== this.frames || clip.firstFrame !== this.firstFrame)) {
      throw new Error('Comparison videos must use matching frame windows and frame rates.');
    }
    this.frame = 0;
    this.desiredPlaying = !reducedMotion.matches;
    this.playing = false;
    this.ready = false;
    this.disposed = false;
    this.active = state.inView && !document.hidden;
    this.abort = new AbortController();
    $('play-pause').disabled = true;
    $('restart').disabled = true;
    $('timeline').disabled = true;
    $('timeline').max = String(this.frames - 1);
    $('timeline').value = '0';
    $('playback-status').textContent = 'Loading this example’s videos…';
    this.updateUI();
    this.load();
  }

  async load() {
    await Promise.all(this.records.map((record) => new Promise((resolve) => {
      const { video, well, clip } = record;
      const fail = () => {
        if (record.failed || this.disposed) return resolve();
        record.failed = true;
        video.hidden = true;
        const message = element('div', 'video-error');
        message.append(element('span', '', 'This video could not be loaded.'));
        const link = element('a', '', 'Open video file');
        link.href = clip.src;
        message.append(link);
        well.append(message);
        resolve();
      };
      video.addEventListener('loadeddata', resolve, { once: true, signal: this.abort.signal });
      video.addEventListener('error', fail, { once: true, signal: this.abort.signal });
      video.src = clip.src;
      video.load();
    })));
    if (this.disposed) return;
    this.ready = true;
    const failed = this.records.filter((record) => record.failed).length;
    $('playback-status').textContent = failed ? `${failed} video${failed === 1 ? '' : 's'} could not be loaded. Other videos remain available.` : '';
    const allFailed = failed === this.records.length;
    $('play-pause').disabled = allFailed;
    $('restart').disabled = allFailed;
    $('timeline').disabled = allFailed;
    this.sync(true);
    if (this.desiredPlaying && this.active && !allFailed) this.play();
  }

  updateUI() {
    if (this.disposed) return;
    $('timeline').value = String(this.frame);
    const renderedFrame = this.firstFrame + this.frame;
    const lastFrame = this.firstFrame + this.frames - 1;
    $('timeline').setAttribute('aria-valuetext', `Rendered frame ${renderedFrame}; shared range ${this.firstFrame} to ${lastFrame}, ${this.frames} frames`);
    $('frame-output').textContent = `${String(renderedFrame).padStart(3, '0')} / ${String(lastFrame).padStart(3, '0')}`;
    $('play-pause').textContent = this.playing ? 'Pause all' : 'Play all';
    $('play-pause').setAttribute('aria-label', this.playing ? 'Pause all videos' : 'Play all videos');
  }

  sync(force = false) {
    if (!this.ready || this.disposed) return;
    const time = this.frame / this.fps;
    for (const { video, clip, finalLabel, failed } of this.records) {
      if (failed) continue;
      const lastTime = (clip.frames - 1) / clip.fps;
      const hold = time >= lastTime;
      const target = Math.min(time, lastTime);
      finalLabel.hidden = !hold;
      if (hold || !this.playing) video.pause();
      if (force || Math.abs(video.currentTime - target) > 0.10) video.currentTime = target;
      video.playbackRate = 1;
      if (this.playing && !hold && video.paused) {
        video.play().catch(() => {
          if (this.disposed || !this.playing) return;
          this.desiredPlaying = false;
          this.pause();
          $('playback-status').textContent = 'Playback was paused by the browser. Press Play all to continue.';
        });
      }
    }
    this.updateUI();
  }

  play() {
    if (this.disposed || !this.ready || this.playing) return;
    this.playing = true;
    this.anchorFrame = this.frame;
    this.anchorTime = performance.now();
    this.sync(true);
    this.animation = requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    if (!this.playing || this.disposed) return;
    let next = Math.floor(this.anchorFrame + (now - this.anchorTime) / 1000 * this.fps);
    let wrapped = false;
    if (next >= this.frames) {
      next %= this.frames;
      this.anchorFrame = next;
      this.anchorTime = now;
      wrapped = true;
    }
    if (next !== this.frame || wrapped) {
      this.frame = next;
      this.sync(wrapped);
    }
    this.animation = requestAnimationFrame((time) => this.tick(time));
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.animation);
    this.records.forEach(({ video }) => video.pause());
    this.updateUI();
  }

  setDesired(playing) {
    this.desiredPlaying = playing;
    if (playing && this.active) this.play();
    else this.pause();
  }

  setActive(active) {
    this.active = active;
    if (active && this.desiredPlaying) this.play();
    else this.pause();
  }

  seek(frame) {
    this.frame = Math.max(0, Math.min(this.frames - 1, frame));
    this.anchorFrame = this.frame;
    this.anchorTime = performance.now();
    this.sync(true);
  }

  dispose() {
    this.pause();
    this.disposed = true;
    this.abort.abort();
    this.records.forEach(({ video }) => {
      video.removeAttribute('src');
      video.load();
    });
  }
}

function makeVideo(clip) {
  const card = element('figure', `media-card${clip.method === 'ours' ? ' media-card--ours' : ''}`);
  const heading = element('figcaption', 'card-heading');
  const name = element('span', 'card-name', clip.label);
  if (clip.method === 'ours') name.append(element('span', 'ours-label', '(ours)'));
  const expand = element('button', 'expand-button', 'Expand');
  expand.type = 'button';
  expand.setAttribute('aria-label', `Expand ${clip.label} video`);
  expand.addEventListener('click', () => expandVideo(clip));
  heading.append(name, expand);
  const well = element('div', 'video-well');
  const video = element('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.poster = clip.poster;
  video.width = clip.width;
  video.height = clip.height;
  video.setAttribute('aria-label', `${clip.label}: ${state.scene.label}, example ${state.example.id}`);
  well.append(video);
  const footer = element('div', 'clip-footer');
  const finalLabel = element('span', 'final-frame', 'Final frame');
  finalLabel.hidden = true;
  footer.append(element('span', '', `${clip.frames} frames · ${clip.duration.toFixed(2)} s`), finalLabel);
  card.append(heading, well, footer);
  return { card, video, well, clip, finalLabel, failed: false };
}

function setOverlay(on) {
  state.overlay = on;
  $('primary-grid').classList.toggle('overlay-mode', on);
  $('overlay-toggle').setAttribute('aria-pressed', String(on));
  $('overlay-toggle').textContent = on ? 'Side-by-side comparison' : 'Overlay GT / Neural-PD';
  $('overlay-controls').hidden = !on;
}

function chooseExample(example) {
  state.player?.dispose();
  state.example = example;
  setOverlay(false);
  $('examples').querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.example === example.id));
  });
  $('primary-grid').replaceChildren();
  $('baseline-grid').replaceChildren();
  const records = example.clips.map(makeVideo);
  for (const record of records) {
    const primary = ['gt', 'ours'].includes(record.clip.method);
    $(primary ? 'primary-grid' : 'baseline-grid').append(record.card);
  }
  const hasGT = example.clips.some((clip) => clip.method === 'gt');
  const hasBaselines = example.clips.some((clip) => !['gt', 'ours'].includes(clip.method));
  $('primary-grid').classList.toggle('single', !hasGT);
  $('baseline-heading').hidden = !hasBaselines;
  $('baseline-grid').hidden = !hasBaselines;
  $('overlay-toggle').hidden = !hasGT;
  $('availability-note').hidden = hasGT && hasBaselines;
  $('availability-note').textContent = !hasGT
    ? `Ground truth is unavailable for example ${example.id}. The predictions below use the same example ID.`
    : 'This example includes ground truth and Neural-PD. Baseline videos are unavailable for this example.';
  $('playback-note').textContent = `Common rendered frames ${String(example.frameStart).padStart(3, '0')}–${String(example.frameEnd).padStart(3, '0')} · ${example.comparisonFrames} frames per method · 1× playback.`;
  state.player = new ComparisonPlayer(records);
}

function chooseScene(scene, exampleId) {
  state.scene = scene;
  $('scene-tabs').querySelectorAll('button').forEach((button) => {
    const selected = button.dataset.scene === scene.id;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('result-panel').setAttribute('aria-labelledby', `tab-${scene.id}`);
  $('result-panel').removeAttribute('aria-label');
  $('scene-title').textContent = scene.label;
  $('scene-description').textContent = scene.description;
  $('examples').replaceChildren();
  for (const example of scene.examples) {
    const button = element('button', '', example.id);
    button.type = 'button';
    button.dataset.example = example.id;
    button.setAttribute('aria-label', `Example ${example.id}`);
    button.addEventListener('click', () => chooseExample(example));
    $('examples').append(button);
  }
  chooseExample(scene.examples.find((example) => example.id === exampleId) || scene.examples[0]);
}

let resumeAfterDialog = false;
function expandVideo(clip) {
  resumeAfterDialog = state.player.desiredPlaying;
  const initialTime = Math.min(state.player.frame / state.player.fps, (clip.frames - 1) / clip.fps);
  state.player.setDesired(false);
  const video = $('expanded-video');
  $('dialog-title').textContent = `${clip.label}${clip.method === 'ours' ? ' (ours)' : ''} · ${state.scene.label} · ${state.example.id}`;
  $('original-video-link').href = clip.original.src;
  video.poster = clip.poster;
  video.muted = true;
  video.playbackRate = 1;
  video.addEventListener('loadedmetadata', () => { video.currentTime = initialTime; }, { once: true });
  video.src = clip.src;
  $('video-dialog').showModal();
}

$('close-dialog').addEventListener('click', () => $('video-dialog').close());
// Native media controls must also retain the requested 1× playback rate.
$('expanded-video').addEventListener('ratechange', (event) => {
  if (event.target.playbackRate !== 1) event.target.playbackRate = 1;
});
$('video-dialog').addEventListener('close', () => {
  const video = $('expanded-video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  state.player?.setDesired(resumeAfterDialog);
});
$('play-pause').addEventListener('click', () => state.player?.setDesired(!state.player.playing));
$('restart').addEventListener('click', () => state.player?.seek(0));
$('timeline').addEventListener('input', (event) => state.player?.seek(Number(event.target.value)));
$('overlay-toggle').addEventListener('click', () => setOverlay(!state.overlay));
$('overlay-split').addEventListener('input', (event) => {
  $('primary-grid').style.setProperty('--split', `${event.target.value}%`);
});
document.addEventListener('visibilitychange', () => state.player?.setActive(state.inView && !document.hidden));
reducedMotion.addEventListener('change', (event) => {
  if (event.matches) state.player?.setDesired(false);
});

const observer = new IntersectionObserver(([entry]) => {
  state.inView = entry.isIntersecting;
  state.player?.setActive(state.inView && !document.hidden);
}, { threshold: 0.05 });
observer.observe($('viewer'));

async function initialize() {
  try {
    const response = await fetch('static/videos.json');
    if (!response.ok) throw new Error('Video list unavailable');
    const { scenes } = await response.json();
    state.scenes = scenes;
    for (const scene of scenes) {
      const tab = element('button', '', scene.label);
      tab.type = 'button';
      tab.id = `tab-${scene.id}`;
      tab.dataset.scene = scene.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', 'result-panel');
      tab.addEventListener('click', () => chooseScene(scene));
      $('scene-tabs').append(tab);
      const preview = element('button', 'scene-preview');
      preview.type = 'button';
      preview.setAttribute('aria-label', `Explore ${scene.label} comparisons`);
      const image = element('img');
      const clip = scene.examples[0].clips.find((candidate) => candidate.method === 'ours');
      image.src = clip.poster;
      image.alt = `Neural-PD ${scene.label.toLowerCase()} prediction`;
      image.width = 960;
      image.height = 540;
      preview.append(image, element('span', '', scene.label));
      preview.addEventListener('click', () => {
        chooseScene(scene);
        $('results').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        tab.focus({ preventScroll: true });
      });
      $('scene-overview').append(preview);
    }
    $('scene-tabs').addEventListener('keydown', (event) => {
      const tabs = [...$('scene-tabs').querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(document.activeElement);
      let next;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
    $('result-panel').hidden = false;
    $('load-status').hidden = true;
    chooseScene(scenes[0]);
  } catch (error) {
    $('load-status').textContent = 'The video list could not be loaded. Serve this folder with a local HTTP server and reload the page.';
    console.error(error);
  }
}

initialize();
