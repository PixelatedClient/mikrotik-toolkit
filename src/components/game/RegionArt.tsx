/** Tiny animated banners for each region of the world map. Decorative. */
const R = ({ x, y, w = 1, h = 1, f, c = '' }: { x: number; y: number; w?: number; h?: number; f: string; c?: string }) => (
  <rect className={c} x={x * 4} y={y * 4} width={w * 4} height={h * 4} fill={f} />
);

export default function RegionArt({ region }: { region: 'subnet' | 'route' | 'fw' }) {
  return (
    <svg className="rg mt-3 w-full max-w-[420px] border-2 border-line" viewBox="0 0 200 44" role="img" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="200" height="44" fill={region === 'fw' ? '#2a1024' : '#1c2266'} />
      <rect y="34" width="200" height="10" fill={region === 'fw' ? '#3a1a30' : '#2f8f4e'} />
      {region === 'subnet' && (
        <>
          {[6, 20, 34, 42].map((x, i) => (
            <g key={x}>
              <R x={x} y={5 + (i % 2)} w={6} h={4} f="#c9a56a" />
              <R x={x - 1} y={4 + (i % 2)} w={8} h={1} f="#b3402e" />
              <R x={x + 4} y={6 + (i % 2)} f="#ffd23f" c="glow" />
            </g>
          ))}
          <R x={0} y={9} w={50} h={1} f="#d9b36a" />
          <rect className="run" x="0" y="35" width="4" height="4" fill="#fff0a8" />
        </>
      )}
      {region === 'route' && (
        <>
          <polygon points="20,34 50,8 80,34" fill="#3d4399" />
          <polygon points="45,14 50,8 55,14" fill="#f4f6ff" />
          <polygon points="110,34 140,14 170,34" fill="#464cab" />
          <R x={0} y={8} w={50} h={1} f="#d9b36a" />
          <rect className="run" x="0" y="35" width="4" height="4" fill="#fff0a8" />
          <rect className="run" style={{ animationDelay: '-1.3s' }} x="0" y="35" width="4" height="4" fill="#fff0a8" />
          <rect className="run" style={{ animationDelay: '-2.6s' }} x="0" y="35" width="4" height="4" fill="#fff0a8" />
        </>
      )}
      {region === 'fw' && (
        <>
          <R x={4} y={4} w={42} h={5} f="#6e3346" />
          {Array.from({ length: 10 }, (_, i) => <R key={i} x={4 + i * 4 + 1} y={3} w={2} h={1} f="#6e3346" />)}
          {[8, 24, 40].map((x) => (
            <g key={x}>
              <R x={x} y={5} f="#3a2a18" />
              <R x={x} y={4} f="#ff9a3a" c="flame" />
            </g>
          ))}
          <rect className="run" x="0" y="35" width="4" height="4" fill="#ff5a5a" />
          <rect className="glow" x="170" y="10" width="8" height="8" fill="#5cff8a" />
        </>
      )}
    </svg>
  );
}
