import Big from 'big.js';

Big.DP = 8;
Big.RM = 1;

const str = (n) => new Big(n);

export const add = (a, b) => str(a).plus(str(b)).toFixed(8);
export const subtract = (a, b) => str(a).minus(str(b)).toFixed(8);
export const multiply = (a, b) => str(a).times(str(b)).toFixed(8);
export const divide = (a, b) => str(a).div(str(b)).toFixed(8);
export const isGreaterThan = (a, b) => str(a).gt(str(b));
export const isLessThan = (a, b) => str(a).lt(str(b));
export const isEqualTo = (a, b) => str(a).eq(str(b));

export const applySpread = (rate, spread) =>
  str(rate).times(str(1).minus(str(spread))).toFixed(8);

export const toDisplay = (amount, decimals = 2) =>
  str(amount).toFixed(decimals);
