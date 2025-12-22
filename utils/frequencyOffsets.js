// utils/frequencyOffsets.js
const { addMonths, addWeeks } = require("date-fns");

/**
 * Defines how to step the due date by frequency:
 *   - fn  = a function(date, step) → new Date
 *   - step (number) = number of intervals (months/weeks)
 */
const FREQUENCY_OFFSETS = {
  MONTHLY: {
    fn: (date, step = 1) => addMonths(date, step),
    step: 1,
  },
  QUARTERLY: {
    fn: (date, step = 1) => addMonths(date, step * 3),
    step: 1, // will be multiplied by 3 internally
  },
  "HALF-YEARLY": {
    fn: (date, step = 1) => addMonths(date, step * 6),
    step: 1,
  },
  YEARLY: {
    fn: (date, step = 1) => addMonths(date, step * 12),
    step: 1,
  },
  // if you ever want weekly: 
  WEEKLY: {
    fn: (date, step = 1) => addWeeks(date, step),
    step: 1,
  },
};

module.exports = FREQUENCY_OFFSETS;
