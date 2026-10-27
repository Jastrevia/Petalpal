// Opens the Help & Feedback card from anywhere (Me → Privacy & support). There is no floating
// button: one in the top-right corner covered the Garden calendar and the × of every panel.
const openers = new Set<() => void>();
export function openHelpFeedback() { openers.forEach(open => open()); }
export function onOpenHelpFeedback(open: () => void) { openers.add(open); return () => { openers.delete(open); }; }
