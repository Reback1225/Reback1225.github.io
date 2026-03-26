const $ = (sel) => document.querySelector(sel);

const jay = $("#jay");
const screenLine = $("#screenLine");
const btnMusic = $("#btnMusic");
const btnLights = $("#btnLights");
const arena = document.querySelector(".arena");
const audio = $("#bgm");

const sources = [
  { src: "./assets/qingtian.mp3", type: "audio/mpeg" },
  { src: "./assets/qingtian.ogg", type: "audio/ogg" },
];

function setButtonPressed(btn, pressed) {
  btn?.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function setMusicLabel(state) {
  btnMusic.textContent = state;
}

async function tryLoadAudio() {
  // Prefer setting src directly to keep it simple; fallback attempts if 404.
  for (const s of sources) {
    audio.src = s.src;
    try {
      await audio.load();
      // Some browsers won't throw here; we still need a real play attempt later.
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

let audioReady = false;
let isSinging = false;
let lightsOn = true;

function updateUI() {
  jay.classList.toggle("is-singing", isSinging);
  arena?.setAttribute("data-lights", lightsOn ? "on" : "off");
  btnLights.textContent = `灯光：${lightsOn ? "开" : "关"}`;
  setButtonPressed(btnLights, lightsOn);
}

async function ensureAudioReady() {
  if (audioReady) return true;

  setMusicLabel("背景音乐：加载中…");
  const ok = await tryLoadAudio();
  audioReady = ok;
  setMusicLabel(ok ? "背景音乐：播放" : "背景音乐：未加载");
  setButtonPressed(btnMusic, false);
  return ok;
}

function setScreen(text) {
  if (screenLine) screenLine.textContent = text;
}

async function playAudio() {
  const ok = await ensureAudioReady();
  if (!ok) {
    setScreen("没找到音频文件：请放到 assets/qingtian.mp3（或 .ogg）");
    return false;
  }
  try {
    await audio.play();
    setMusicLabel("背景音乐：暂停");
    setButtonPressed(btnMusic, true);
    return true;
  } catch {
    setScreen("浏览器阻止了自动播放：请先点击一次“背景音乐”按钮或周杰伦。");
    setMusicLabel("背景音乐：播放");
    setButtonPressed(btnMusic, false);
    return false;
  }
}

function pauseAudio() {
  audio.pause();
  setMusicLabel(audioReady ? "背景音乐：播放" : "背景音乐：未加载");
  setButtonPressed(btnMusic, false);
}

async function toggleSinging() {
  if (isSinging) {
    isSinging = false;
    pauseAudio();
    setScreen("他先停一下，听听全场的合唱。再点一次继续。");
    updateUI();
    return;
  }

  isSinging = true;
  updateUI();
  setScreen("他在唱歌了（点击他可以暂停）。");
  await playAudio();
}

btnLights?.addEventListener("click", () => {
  lightsOn = !lightsOn;
  updateUI();
});

btnMusic?.addEventListener("click", async () => {
  const playing = !audio.paused && !audio.ended;
  if (playing) {
    pauseAudio();
    setScreen("背景音乐暂停啦。点击周杰伦或右上角继续。");
    isSinging = false;
    updateUI();
    return;
  }
  await playAudio();
  isSinging = true;
  updateUI();
  setScreen("背景音乐响起啦。点击周杰伦看他唱歌。");
});

jay?.addEventListener("click", async () => {
  await toggleSinging();
});

audio?.addEventListener("play", () => {
  setMusicLabel("背景音乐：暂停");
  setButtonPressed(btnMusic, true);
});
audio?.addEventListener("pause", () => {
  setMusicLabel(audioReady ? "背景音乐：播放" : "背景音乐：未加载");
  setButtonPressed(btnMusic, false);
});
audio?.addEventListener("error", () => {
  audioReady = false;
  setMusicLabel("背景音乐：未加载");
  setButtonPressed(btnMusic, false);
});

updateUI();
setMusicLabel("背景音乐：未加载");
setScreen("点击周杰伦本人之后，会发现他在唱歌。");

