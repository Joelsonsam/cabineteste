import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

async function boot() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('500 40px "Host Grotesk Variable"'),
        document.fonts.load('400 40px "Host Grotesk Variable"'),
        document.fonts.load('400 12px "Geist Mono Variable"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* segue com a fonte do sistema */
  }
  mount(App, { target: document.getElementById('app')! });
}

boot();
