const radial = (count, radius, start = 0, y = 0, center = 0) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (start + index * 360 / count) * Math.PI / 180;
    return [center + radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });
const inside = (x, z, center, radius) => Math.hypot(x - center, z) <= radius;
const deck = (x, z) => x >= 26 && x <= 44 && Math.abs(z) <= 2;
const rampAngles = [30, 150].map(degrees => degrees * Math.PI / 180);
function tiers(x, z) {
  const radius = Math.hypot(x, z);
  if (radius > 45) return [];
  const heights = [0];
  if (radius <= 8) heights.push(6);
  if (z > 0 && radius >= 12 && radius <= 24) heights.push(3);
  for (const angle of rampAngles) {
    const along = x * Math.cos(angle) + z * Math.sin(angle);
    const across = -x * Math.sin(angle) + z * Math.cos(angle);
    if (along >= 22.5 && along <= 30 && Math.abs(across) <= 1.5) {
      heights.push(Math.min(3, (30 - along) / 2));
    }
  }
  return heights;
}
export const nights = {
  1: {
    name: 'Đảo Bến', introduction: 'Gom ánh sáng và thắp đèn để xua sương khỏi bến.',
    islands: [[0, 40]], floors: (x, z) => inside(x, z, 0, 40) ? [0] : [],
    lanterns: [[0,0,25],[23.8,0,7.7],[14.7,0,-20.2],[-14.7,0,-20.2],[-23.8,0,7.7]],
    motePoints: [...radial(8, 12), ...radial(16, 33)], shadePoints: radial(12, 37, 15),
    shadePeriod: 8, shadeLimit: 6, pads: [], charms: [],
  },
  2: {
    name: 'Cầu Tre', introduction: 'Cẩn thận ở mép cầu. Bục nhảy có thể đưa cháu qua biển mây.',
    islands: [[0, 28], [70, 28]],
    floors: (x, z) => inside(x, z, 0, 28) || inside(x, z, 70, 28) || deck(x, z) ? [0] : [],
    bridge: [[26,0,-2],[44,0,-2],[44,0,2],[26,0,2]],
    lanterns: [[0,0,20],[17,0,-10],[-17,0,-10],[70,0,20],[87,0,-10],[53,0,-10]],
    motePoints: [0, 70].flatMap(center => [...radial(4, 10, 0, 0, center), ...radial(8, 22, 0, 0, center)]),
    shadePoints: [0, 70].flatMap(center => radial(8, 26, 22.5, 0, center)),
    shadePeriod: 7, shadeLimit: 8, charms: [[35,0,0]],
    pads: [{ pos: [20,0,18], target: [70,0,0], speed: 24, up: 14 },
      { pos: [50,0,-18], target: [0,0,0], speed: 24, up: 14 }],
  },
  3: {
    name: 'Đảo Tháp Chuông', introduction: 'Đi theo dốc lên tầng hai, rồi dùng bục nhảy để tới tháp chuông.',
    islands: [[0, 45]], floors: tiers,
    lanterns: [[0,6,6],[18,3,10],[-18,3,10],[35,0,-10],[-35,0,-10],[20,0,-35],[-20,0,-35]],
    motePoints: [...radial(18, 34), ...Array.from({ length: 8 }, (_, i) => radial(1, 18, 20 * (i + 1), 3)[0]),
      ...radial(4, 5, 45, 6)],
    shadePoints: radial(16, 43), shadePeriod: 6, shadeLimit: 10,
    pads: [{ pos: [0,3,13], target: [0,3,0], speed: 8, up: 12 }],
    charms: [[30,0,25],[-30,0,25]],
  },
};
