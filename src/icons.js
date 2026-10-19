// icons.js -- line icons drawn for this app, in the current text colour.
// The four tab icons are the LÖVE app's: a calculator, a sword, an impact
// burst (eleven uneven spikes, so it reads as a hit and not a compass) and a
// percent sign. Each roll button carries the icon of the tab its result
// lands on.

const svg = (body, extra = "") =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

function burstPath() {
  const spikes = 11, pts = [];
  const outer = [10.2, 8.6, 10.6, 9.0, 10.0, 8.4, 10.8, 9.2, 9.8, 8.8, 10.4];
  const jitter = [0, 0.09, -0.05, 0.07, -0.08, 0.04, -0.03, 0.08, -0.06, 0.05, -0.02];
  for (let i = 0; i < spikes; i++) {
    const a = -Math.PI / 2 + (i / spikes) * Math.PI * 2 + jitter[i];
    const b = a + Math.PI / spikes;
    pts.push([12 + Math.cos(a) * outer[i], 12 + Math.sin(a) * outer[i]]);
    pts.push([12 + Math.cos(b) * 4.6, 12 + Math.sin(b) * 4.6]);
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z";
}

export const ICONS = {
  calculator: svg(`<rect x="5" y="2.8" width="14" height="18.4" rx="2.2"/><rect x="7.6" y="5.4" width="8.8" height="3.6" rx=".8"/><circle cx="8.6" cy="12.6" r=".55" fill="currentColor"/><circle cx="12" cy="12.6" r=".55" fill="currentColor"/><circle cx="15.4" cy="12.6" r=".55" fill="currentColor"/><circle cx="8.6" cy="15.6" r=".55" fill="currentColor"/><circle cx="12" cy="15.6" r=".55" fill="currentColor"/><circle cx="15.4" cy="15.6" r=".55" fill="currentColor"/><circle cx="8.6" cy="18.5" r=".55" fill="currentColor"/><path d="M11.2 18.5h4.8"/>`),
  sword: svg(`<path d="M20.5 3.5l-.6 3.4L9.6 17.2l-2.8-2.8L17.1 4.1z"/><path d="M5.2 12.8l6 6"/><path d="M7.4 16.6l-3.6 3.6"/><circle cx="3.4" cy="20.6" r="1"/>`),
  burst: svg(`<path d="${burstPath()}"/>`),
  percent: svg(`<circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/><path d="M18.5 4.5l-13 15"/>`),
  book: svg(`<path d="M4.5 4.8c2.6-1 5.2-1 7.5.6 2.3-1.6 4.9-1.6 7.5-.6v14c-2.6-1-5.2-1-7.5.6-2.3-1.6-4.9-1.6-7.5-.6z"/><path d="M12 5.4v14"/>`),
  party: svg(`<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="7.5" r="2.4"/><path d="M15.8 12.6c2.5-.2 4.3 1.4 4.8 4.4"/>`),
  pencil: svg(`<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>`),
  cross: svg(`<path d="M6 6l12 12M18 6L6 18"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14"/>`),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  chevron: svg(`<path d="M8 10l4 4 4-4"/>`),
  more: svg(`<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>`),
  download: svg(`<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>`),
  upload: svg(`<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>`),
  phone: svg(`<rect x="7" y="2.8" width="10" height="18.4" rx="2"/><path d="M10.5 18h3"/>`),
  up: svg(`<path d="M8 14l4-4 4 4"/>`),
  down: svg(`<path d="M8 10l4 4 4-4"/>`),
  close: svg(`<path d="M6 6l12 12M18 6L6 18"/>`),
};
