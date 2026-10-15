import { OfficeWorld } from './world';
import { StationWorld } from './stationWorld';
import { MoneyWorld } from './moneyWorld';
import { AmountWorld } from './amountWorld';
import { DocumentWorld } from './documentWorld';
import { STAGES } from '../data/stages';
import { disposeWorld } from './dispose';
import { GameState } from './state';
import { GameUI } from '../ui/ui';
import { Controls } from './controls';
import { moveWithCollision, nearestClue } from './interactions';
import { Sound } from './sound';
import type { Choice, UIAction, StageId } from './types';
import { COPY } from '../data/stage01';

export class Game {
  readonly state: GameState;
  world: OfficeWorld | StationWorld | MoneyWorld | AmountWorld | DocumentWorld;
  readonly ui: GameUI;
  readonly controls: Controls;
  readonly sound = new Sound();
  private x = 0;
  private z = -0.25;
  private facing = 0;
  private previousTime = 0;
  private elapsed = 0;
  private cinematicTime = 0;
  private hudTime = 0;
  private contextLost = false;
  private captureCamera: { position: [number, number, number]; target: [number, number, number]; fov: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, root: HTMLElement) {
    const parameters = new URLSearchParams(location.search);
    const diagnosticsEnabled = import.meta.env.DEV || parameters.has('qa');
    const requestedSeed = parameters.get('seed');
    let seed = diagnosticsEnabled && requestedSeed !== null && /^\d+$/.test(requestedSeed) && Number(requestedSeed) <= 0xffffffff
      ? Number(requestedSeed) : null;
    this.state = new GameState({
      fixed: diagnosticsEnabled && parameters.get('fixture') === 'original',
      seedSource: seed === null ? undefined : () => {
        const result = seed!;
        seed = (result + 0x9e3779b9) >>> 0;
        return result;
      },
    });
    const requestedStage = parameters.get('stage');
    if (requestedStage && Object.hasOwn(STAGES, requestedStage)) this.state.selectStage(requestedStage as StageId);
    this.x = this.state.stage.start.x;
    this.z = this.state.stage.start.z;
    this.ui = new GameUI(root, this.action, () => this.state.stage);
    this.world = this.createWorld();
    this.controls = new Controls(() => this.state.phase === 'EXPLORE' && !document.hidden && !this.contextLost, this.action);
    this.ui.render(this.state.snapshot());
    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => { this.previousTime = 0; this.controls.clear(); });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); this.contextLost = true; this.previousTime = 0; this.controls.clear();
      this.ui.showError(COPY.contextLost);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false; this.previousTime = 0; this.state.openMenu(); this.sync();
    });
    try {
      if (localStorage.getItem('souiu-imi-quality') === 'low') this.state.toggleQuality();
    } catch { /* Storage is optional. */ }
    this.resize();
    requestAnimationFrame(this.frame);
    if (diagnosticsEnabled) this.installDiagnostics();
  }

  private createWorld() {
    if (this.state.stageId === 'stage05') return new DocumentWorld(this.canvas, this.state.case?.documentPlan);
    if (this.state.stageId === 'stage04') return new AmountWorld(this.canvas, this.state.case?.amountPlan);
    if (this.state.stageId === 'stage03') return new MoneyWorld(this.canvas, this.state.case?.moneyPlan);
    return this.state.stageId === 'stage02'
      ? new StationWorld(this.canvas, this.state.case?.stationPlan)
      : new OfficeWorld(this.canvas, this.state.case?.officeUnit);
  }

  private replaceWorld() {
    this.controls.clear();
    this.captureCamera = null;
    disposeWorld(this.world);
    this.world = this.createWorld();
    this.cinematicTime = 0;
    this.resize();
    this.resetPlayer();
  }

  private sync() {
    this.controls.clear();
    this.ui.render(this.state.snapshot());
    this.world.setClues(new Set(this.state.found), this.state.nearest);
  }

  private resetPlayer() {
    this.captureCamera = null;
    this.x = this.state.stage.start.x; this.z = this.state.stage.start.z; this.facing = 0;
    this.controls.resetCamera(); this.controls.clear();
    this.world.reset();
    this.world.updatePlayer(this.x, this.z, this.facing, false, 0);
    this.world.updateExplorationCamera(this.x, this.z, this.controls.yaw, this.controls.pitch, 0, true);
  }

  private action = (action: UIAction, detail?: string) => {
    const before = this.state.phase;
    const stageBefore = this.state.stageId;
    const seedBefore = this.state.snapshot().caseSeed;
    switch (action) {
      case 'stage':
        if (detail && Object.hasOwn(STAGES, detail)) this.state.selectStage(detail as StageId);
        break;
      case 'next': this.state.next(); break;
      case 'newcase': this.state.newCase(); break;
      case 'start': this.state.start(); break;
      case 'explore': if (this.state.explore()) this.resetPlayer(); break;
      case 'inspect': {
        if (this.state.phase !== 'EXPLORE') break;
        const id = nearestClue(this.x, this.z, this.state.stage.clues);
        if (id && this.state.inspect(id)) this.sound.play('clue');
        break;
      }
      case 'close':
        if (before === 'EXPLORE') this.state.openMenu();
        else if (before === 'DECISION') this.state.back();
        else this.state.close();
        break;
      case 'menu': this.state.openMenu(); break;
      case 'journal': this.state.openJournal(); break;
      case 'decision': this.state.decide(); break;
      case 'back': this.state.back(); break;
      case 'choose':
        if (['A', 'B', 'C'].includes(detail ?? '') && this.state.choose(detail as Choice)) {
          this.cinematicTime = 0; this.world.startEnding(detail as Choice); this.sound.play('ending');
        }
        break;
      case 'retry': if (this.state.retry()) this.resetPlayer(); break;
      case 'title': if (this.state.title()) this.resetPlayer(); break;
      case 'sound': this.state.toggleSound(); this.sound.setEnabled(this.state.sound); break;
      case 'quality':
        this.state.toggleQuality(); this.resize();
        try { localStorage.setItem('souiu-imi-quality', this.state.lowQuality ? 'low' : 'normal'); } catch { /* optional */ }
        break;
      case 'camera': this.controls.resetCamera(); break;
    }
    const caseChanged = this.state.stageId !== stageBefore || this.state.snapshot().caseSeed !== seedBefore;
    if (caseChanged) this.replaceWorld();
    if (this.state.phase !== before || caseChanged || ['sound', 'quality', 'stage'].includes(action)) {
      this.sound.play('tap'); this.sync();
    }
  };

  private resize = () => {
    this.world.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio || 1, this.state.lowQuality ? 1 : 1.5));
  };

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const realDt = this.previousTime ? Math.max(0, (now - this.previousTime) / 1000) : 0;
    this.previousTime = now;
    if (document.hidden || this.contextLost) return;
    const dt = Math.min(realDt, 0.05);
    this.elapsed += dt;
    const phaseBefore = this.state.phase;
    this.state.tick(realDt, true);
    if (this.state.phase !== phaseBefore) this.sync();

    if (this.state.phase === 'TITLE' || this.state.phase === 'INTRO') {
      this.world.showTitle(this.elapsed);
    } else if (this.state.phase === 'CINEMATIC' && this.state.choice) {
      this.cinematicTime += dt;
      this.world.updateEnding(this.cinematicTime, this.state.choice);
      if (this.cinematicTime >= this.state.stage.cinematicSeconds[this.state.choice]) { this.state.finishEnding(); this.sync(); }
    } else if (this.state.phase === 'EXPLORE') {
      const input = this.controls.vector();
      const dx = (input.x * Math.cos(this.controls.yaw) + input.y * Math.sin(this.controls.yaw)) * 2.6 * dt;
      const dz = (-input.x * Math.sin(this.controls.yaw) + input.y * Math.cos(this.controls.yaw)) * 2.6 * dt;
      const previousX = this.x; const previousZ = this.z;
      const next = moveWithCollision(this.x, this.z, dx, dz, this.world.colliders);
      this.x = next.x; this.z = next.z;
      const moving = Math.hypot(this.x - previousX, this.z - previousZ) > 0.0001;
      if (moving) this.facing = Math.atan2(-(this.x - previousX), -(this.z - previousZ));
      this.world.updatePlayer(this.x, this.z, this.facing, moving, dt);
      this.world.updateExplorationCamera(this.x, this.z, this.controls.yaw, this.controls.pitch, dt);
      const nearest = nearestClue(this.x, this.z, this.state.stage.clues);
      if (nearest !== this.state.nearest) {
        this.state.setNearest(nearest);
        this.world.setClues(new Set(this.state.found), nearest);
        this.ui.updateHUD(this.state.snapshot());
      }
    }
    this.world.update(dt, this.elapsed);
    if (this.captureCamera) {
      this.world.camera.position.set(...this.captureCamera.position);
      this.world.camera.fov = this.captureCamera.fov;
      this.world.camera.updateProjectionMatrix();
      this.world.camera.lookAt(...this.captureCamera.target);
    }
    this.world.render();
    this.hudTime += dt;
    if (this.hudTime >= 0.15) { this.hudTime = 0; this.ui.updateHUD(this.state.snapshot()); }
  };

  private installDiagnostics() {
    // Explicit opt-in for repeatable QA. Normal production visits expose no game controls.
    Object.assign(window, { __game: {
      snapshot: () => ({ ...this.state.snapshot(), x: this.x, z: this.z, yaw: this.controls.yaw, pitch: this.controls.pitch, input: this.controls.vector(), calls: this.world.renderer.info.render.calls, cinematicDuration: this.state.choice ? this.state.stage.cinematicSeconds[this.state.choice] : 0 }),
      stage: () => this.state.stage,
      instance: () => this.state.case,
      teleport: (x: number, z: number) => { this.x = x; this.z = z; },
      advance: (seconds: number) => { this.state.tick(seconds, !document.hidden); this.sync(); },
      action: this.action,
      cinematic: (seconds: number) => { this.cinematicTime = seconds; },
      colliders: () => this.world.colliders,
      visuals: () => this.world.diagnostics(),
      captureView: (position: [number, number, number], target: [number, number, number], fov = 42) => {
        if (position?.length === 3 && target?.length === 3 && [...position, ...target, fov].every(Number.isFinite)) {
          this.captureCamera = { position: [...position], target: [...target], fov: Math.max(20, Math.min(70, fov)) };
        }
      },
      clearCaptureView: () => { this.captureCamera = null; },
    } });
  }
}
