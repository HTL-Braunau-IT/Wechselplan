import { beforeAll, afterAll } from '@jest/globals';

// Suppress console.error and console.warn during tests
const originalError = console.error
const originalWarn = console.warn

beforeAll(() => {
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('punycode')) {
      return
    }
    originalError.call(console, ...args)
  }
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('punycode')) {
      return
    }
    originalWarn.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
  console.warn = originalWarn
})

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'mock-url';
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = function() {};
} 