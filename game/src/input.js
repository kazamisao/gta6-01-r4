// input.js — keyboard and mouse state for Verano Bay. One object the game
// loop polls: held keys by code, edge-triggered presses for actions like
// entering a car or pausing, and the mouse position in canvas pixels with
// its aim button.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const input = {
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    down(code) { return held.has(code); },
    // True only on the first frame after the key went down.
    tap(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    driving() {
      return {
        up: held.has('KeyW') || held.has('ArrowUp'),
        down: held.has('KeyS') || held.has('ArrowDown'),
        left: held.has('KeyA') || held.has('ArrowLeft'),
        right: held.has('KeyD') || held.has('ArrowRight'),
        handbrake: held.has('Space'),
      };
    },
    walkVector() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x, y };
    },
    sprint() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    endFrame() { pressed.clear(); },
  };

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    input.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) input.mouseDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  return input;
}
