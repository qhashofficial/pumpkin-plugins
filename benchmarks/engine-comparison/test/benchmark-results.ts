/** Formats an integer with en-US digit grouping, so reports read the same on every host locale. */
export const formatInteger = new Intl.NumberFormat('en-US').format;
