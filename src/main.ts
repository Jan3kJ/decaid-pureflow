import './migrate';
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { startViewport } from './viewport';

startViewport();

export default mount(App, { target: document.getElementById('app')! });
