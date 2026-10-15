// Validasi koordinat GPS. Titik (0,0) dianggap tidak valid karena itu hasil GPS tanpa fix.
export const validCoord = (lat, lng) => {
  if (lat == null || lng == null) return false;
  const a = Number(lat),
    b = Number(lng);
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a) <= 90 &&
    Math.abs(b) <= 180 &&
    !(a === 0 && b === 0)
  );
};
export const hasPos = (d) => !!d && validCoord(d.lat, d.lng);
