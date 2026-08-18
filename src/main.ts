import './styles.css';
import { TidebornGame } from './game/Game';
import { MobileControlSystem } from './game/MobileControlSystem';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');

const game = new TidebornGame(root);
const mobileControls = new MobileControlSystem(root, {
  onLayoutChange: (layout) => game.applyMobileCameraLayout(layout),
});
if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __tidebornTest?: TidebornGame }).__tidebornTest = game;
  (window as unknown as { __tidebornMobile?: MobileControlSystem }).__tidebornMobile = mobileControls;
}
game.startLoop();
