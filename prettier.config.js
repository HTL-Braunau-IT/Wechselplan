/**
 * Prettier was configured with nothing but the Tailwind plugin, so it ran with
 * upstream defaults — double quotes, semicolons, 80 columns — none of which
 * match how this codebase is actually written. `npm run format:check` had
 * therefore never passed, and formatting under those defaults would have
 * rewritten essentially every line for no reason.
 *
 * The settings below were measured against the existing source rather than
 * picked: single quotes 1180 imports to 105, no semicolons 1143 to 146,
 * unparenthesised single arrow params 412 to 224, and the 90th percentile line
 * is 74 columns. Formatting therefore preserves the house style rather than
 * replacing it.
 *
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions}
 */
export default {
  plugins: ['prettier-plugin-tailwindcss'],
  semi: false,
  singleQuote: true,
  arrowParens: 'avoid',
  printWidth: 100,
  trailingComma: 'all',
}
