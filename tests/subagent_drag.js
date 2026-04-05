// Paste this into subagent execute_javascript
const grip = document.querySelector('.toolbar-grip');
const box = grip.getBoundingClientRect();
const cx = box.left + box.width/2;
const cy = box.top + box.height/2;

console.log("Triggering down at", cx, cy);
const downEvent = new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 });
grip.dispatchEvent(downEvent);

// Now trigger move on document, with SAME pointerId!
const moveEvent1 = new PointerEvent('pointermove', { pointerId: 1, bubbles: true, cancelable: true, clientX: cx + 10, clientY: cy + 10 });
document.dispatchEvent(moveEvent1);

const moveEvent2 = new PointerEvent('pointermove', { pointerId: 1, bubbles: true, cancelable: true, clientX: cx + 200, clientY: cy + 200 });
document.dispatchEvent(moveEvent2);
