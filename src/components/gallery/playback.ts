/*
  «زبايننا المرتّبين»: one video plays at a time on the whole page (the mirror, the row, the reels viewer), all silent.
  `play(video)` pauses whatever was playing before; a hidden tab pauses it and showing the tab again resumes it.
  Browser only (called from effects and handlers).
*/

let current: HTMLVideoElement | null = null;
let resumeOnShow = false;
let listening = false;

function onVisibility() {
  if (!current) return;
  if (document.hidden) {
    resumeOnShow = !current.paused;
    current.pause();
  } else if (resumeOnShow) {
    resumeOnShow = false;
    void current.play().catch(() => {});
  }
}

/** Play this video (muted, inline) and pause the one before it. */
export function play(video: HTMLVideoElement) {
  if (!listening) {
    document.addEventListener("visibilitychange", onVisibility);
    listening = true;
  }
  if (current && current !== video) current.pause();
  current = video;
  video.muted = true;
  video.playsInline = true;
  if (document.hidden) {
    resumeOnShow = true;
    return;
  }
  void video.play().catch(() => {});
}

/** Pause this video if it is the one playing (a card leaving the centre, the viewer closing). */
export function release(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  if (current === video) {
    current = null;
    resumeOnShow = false;
  }
}

export const isPlaying = (video: HTMLVideoElement | null) => video !== null && current === video && !video.paused;
