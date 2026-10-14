/*
 * Decorative line-art flowers for the site header, drawn in the same thin
 * navy stroke as the brand illustrations. Purely ornamental: hidden from
 * assistive technology and never intercepts clicks.
 */

const PETAL_ANGLES = [0, 72, 144, 216, 288];

function Tulip({ x, top }: { x: number; top: number }) {
  return (
    <g>
      <path d={`M${x} 72 C ${x - 2} ${top + 26}, ${x + 2} ${top + 14}, ${x} ${top}`} />
      <path
        d={`M${x} ${top} C ${x - 7} ${top - 3}, ${x - 9} ${top - 12}, ${x - 6} ${top - 20} C ${x - 4} ${top - 16}, ${x - 2} ${top - 14}, ${x} ${top - 13} C ${x + 2} ${top - 14}, ${x + 4} ${top - 16}, ${x + 6} ${top - 20} C ${x + 9} ${top - 12}, ${x + 7} ${top - 3}, ${x} ${top} Z`}
      />
      <path
        d={`M${x} ${top - 13} C ${x - 2} ${top - 17}, ${x - 2} ${top - 21}, ${x} ${top - 24} C ${x + 2} ${top - 21}, ${x + 2} ${top - 17}, ${x} ${top - 13}`}
      />
    </g>
  );
}

function Blossom({ x, top }: { x: number; top: number }) {
  return (
    <g>
      <path d={`M${x} 72 C ${x + 2} ${top + 28}, ${x - 2} ${top + 18}, ${x} ${top + 8}`} />
      {PETAL_ANGLES.map((angle) => (
        <ellipse
          key={angle}
          cx={x}
          cy={top - 6}
          rx={3.6}
          ry={6.5}
          transform={`rotate(${angle} ${x} ${top})`}
        />
      ))}
      <circle cx={x} cy={top} r={2.2} className="fill-accent-200" />
    </g>
  );
}

function Leaf({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const d = flip ? 1 : -1;
  return (
    <g>
      <path
        d={`M${x} ${y} C ${x + d * 10} ${y - 4}, ${x + d * 16} ${y - 12}, ${x + d * 17} ${y - 20} C ${x + d * 8} ${y - 16}, ${x + d * 2} ${y - 8}, ${x} ${y} Z`}
      />
      <path d={`M${x} ${y} C ${x + d * 6} ${y - 7}, ${x + d * 11} ${y - 13}, ${x + d * 17} ${y - 20}`} />
    </g>
  );
}

function Sprig({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x} 72 C ${x - 1} 60, ${x + 3} 50, ${x + 8} 40`} />
      <ellipse cx={x + 9} cy={37} rx={2.4} ry={4} transform={`rotate(25 ${x + 9} 37)`} />
      <path d={`M${x + 2} 58 C ${x - 4} 54, ${x - 7} 50, ${x - 8} 46`} />
      <ellipse cx={x - 9} cy={43} rx={2.2} ry={3.6} transform={`rotate(-20 ${x - 9} 43)`} />
      <path d={`M${x + 4} 50 C ${x + 9} 48, ${x + 13} 45, ${x + 15} 41`} />
      <ellipse cx={x + 16} cy={38} rx={2} ry={3.4} transform={`rotate(30 ${x + 16} 38)`} />
    </g>
  );
}

/** One cluster, growing up from the bottom edge, densest at its right end. */
function Cluster() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Sprig x={36} />
      <Leaf x={74} y={72} />
      <Tulip x={92} top={40} />
      <Leaf x={92} y={60} />
      <Blossom x={128} top={30} />
      <Leaf x={128} y={64} flip />
      <Sprig x={150} />
      <Tulip x={186} top={32} />
      <Leaf x={186} y={56} flip />
      <Blossom x={214} top={38} />
    </g>
  );
}

export function FloralGarland() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden text-brand-700/60">
      <svg
        viewBox="0 0 230 72"
        preserveAspectRatio="xMaxYMax slice"
        className="absolute bottom-0 right-0 aspect-[230/72] h-full max-w-[34%] sm:max-w-none"
      >
        <Cluster />
      </svg>
      <svg
        viewBox="0 0 230 72"
        preserveAspectRatio="xMaxYMax slice"
        className="absolute bottom-0 left-[300px] hidden aspect-[230/72] h-full -scale-x-100 lg:block"
      >
        <Cluster />
      </svg>
      <svg
        viewBox="0 0 230 72"
        preserveAspectRatio="xMaxYMax slice"
        className="absolute bottom-0 left-[calc(50%+150px)] hidden aspect-[230/72] h-full -translate-x-1/2 lg:block"
      >
        <Cluster />
      </svg>
    </div>
  );
}
