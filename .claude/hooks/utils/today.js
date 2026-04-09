#!/usr/bin/env node

export function today() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

export function nowTime() {
  return new Date().toTimeString().slice(0, 5); // HH:MM
}
