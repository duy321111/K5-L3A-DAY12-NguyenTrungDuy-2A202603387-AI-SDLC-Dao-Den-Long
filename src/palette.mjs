export const palette = Object.freeze({
  sky: '#0E1430', fog: '#1B2350', grass: '#2F5D50', sand: '#C9B48A',
  wood: '#6B4A2F', sea: '#12384A', lantern: '#FFB347', lanternCore: '#FFE9B0',
  lanternOff: '#5B5F6E', moteCore: '#FFF6C2', moteGlow: '#FFE58A',
  shade: '#120A1A', shadeRim: '#7A3CFF', stunned: '#3A3450',
  coat: '#E8E2D0', scarf: '#C8102E', gold: '#F2C14E',
  drifter: '#8FA3B8', danger: '#FF5A5F', text: '#F5F1E6',
});
export const ambientStrength = (lit, total) => 0.15 + 0.55 * lit / total;
