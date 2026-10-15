import { defineConfig } from 'vite';
import offlineGame from './build/pwa-plugin.mjs';

export default defineConfig({ base: './', plugins: [offlineGame()], build: { target: 'es2022' } });
