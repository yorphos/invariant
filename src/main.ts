import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Remove splash screen once the app is mounted and ready
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
      // Remove from DOM after fade animation completes
      setTimeout(() => {
        splash.remove();
      }, 300);
    }
  }, 100); // Small delay to ensure everything is rendered
});

export default app
