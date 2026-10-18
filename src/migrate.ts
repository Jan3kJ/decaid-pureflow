// Runs before any module reads localStorage: main.ts imports it first.
import { moveFormerKeys } from './former-keys';

moveFormerKeys();
