import './styles.css';
import { TidebornGame } from './game/Game';
import { MobileControlSystem } from './game/MobileControlSystem';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');

const game = new TidebornGame(root);
const mobileControls = new MobileControlSystem(root, {
  onLayoutChange: (layout) => game.applyMobileCameraLayout(layout),
  moveSensitivity: (window as unknown as { tidebornAccess?: { get(key: 'touchSensitivity'): number } }).tidebornAccess?.get('touchSensitivity') ?? 1,
});
const access = (window as unknown as { tidebornAccess?: {
  get(key: 'touchSensitivity'): number;
  subscribe(fn: (settings: { touchSensitivity: number }) => void): () => void;
} }).tidebornAccess;
access?.subscribe((settings) => mobileControls.setMoveSensitivity(settings.touchSensitivity));
if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __tidebornTest?: TidebornGame }).__tidebornTest = game;
  (window as unknown as { __tidebornMobile?: MobileControlSystem }).__tidebornMobile = mobileControls;
}
game.startLoop();
