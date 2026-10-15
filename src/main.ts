import './ui/style.css';
import { Game } from './game/Game';
import { getStage, STAGES } from './data/stages';
import type { StageId } from './game/types';
import { installPWA } from './pwa';

const requestedStage = new URLSearchParams(location.search).get('stage');
const COPY = getStage(requestedStage && Object.hasOwn(STAGES, requestedStage) ? requestedStage as StageId : 'stage01').copy;

try {
  new Game(document.querySelector<HTMLCanvasElement>('#world')!, document.querySelector<HTMLElement>('#ui')!);
} catch (error) {
  console.error(error);
  const root = document.getElementById('ui')!;
  root.innerHTML = `<main class="fallback"><div class="fallback-paper"><p>${COPY.company}</p><h1>${COPY.fallbackHeading}</h1><p>${COPY.webglError}</p><button type="button" id="reload">${COPY.reload}</button></div></main>`;
  document.getElementById('reload')?.addEventListener('click', () => location.reload());
}

installPWA();
