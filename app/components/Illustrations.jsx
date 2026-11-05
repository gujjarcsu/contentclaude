/**
 * Illustrations — small SVG drawings of Navaal's own screens, for checklist
 * steps and empty states (Tapita 063 draws its theme editor beside the
 * checklist step; brief v2 asks for the same, from our UI, not stock art).
 *
 * Decorative: aria-hidden, no text a reader needs. Colours are the brand and
 * Polaris tokens through classes in brand.css, so they follow the admin.
 * Each is 240×160 in its own viewBox and scales to its container.
 */
const Svg = ({ children, width = 240 }) => (
  <svg className="nv-illu" viewBox="0 0 240 160" width={width} aria-hidden="true" focusable="false">
    {children}
  </svg>
);

/** A panel: white card with a soft edge. */
const Panel = ({ x, y, w, h, r = 10 }) => <rect x={x} y={y} width={w} height={h} rx={r} className="s ln" strokeWidth="1.5" />;
const Line = ({ x, y, w, h = 6, c = "l" }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} className={c} />;

/** The score card: a ring at 65 and three dimension bars. */
export function IlluScore({ width }) {
  return (
    <Svg width={width}>
      <circle cx="210" cy="30" r="28" className="bt" />
      <Panel x="24" y="22" w="192" h="116" />
      <circle cx="74" cy="80" r="30" className="bt" />
      <circle cx="74" cy="80" r="26" fill="none" className="ln" strokeWidth="7" />
      <path d="M74 54 A26 26 0 1 1 49.3 88" fill="none" className="stroke-b" strokeWidth="7" strokeLinecap="round" />
      <Line x={64} y={77} w={20} h={7} c="b" />
      <Line x={120} y={52} w={78} />
      <Line x={120} y={62} w={60} h={5} c="bts" />
      <Line x={120} y={78} w={78} />
      <Line x={120} y={88} w={44} h={5} c="bts" />
      <Line x={120} y={104} w={78} />
      <Line x={120} y={114} w={70} h={5} c="bts" />
    </Svg>
  );
}

/** The theme editor with the FAQ (Navaal) block highlighted on a product page. */
export function IlluThemeEditor({ width }) {
  return (
    <Svg width={width}>
      <circle cx="30" cy="130" r="28" className="bt" />
      <Panel x="20" y="18" w="200" h="124" />
      <rect x="20" y="18" width="58" height="124" rx="10" className="bt" />
      <Line x={30} y={32} w={38} />
      <Line x={30} y={46} w={30} h={5} />
      <rect x="28" y="60" width="42" height="16" rx="5" className="b" />
      <Line x={34} y={66} w={28} h={4} c="s" />
      <Line x={30} y={86} w={34} h={5} />
      <rect x="90" y="30" width="54" height="44" rx="6" className="l" />
      <Line x={152} y={32} w={56} />
      <Line x={152} y={44} w={40} h={5} />
      <rect x="152" y="56" width="36" height="12" rx="4" className="l" />
      <rect x="88" y="84" width="122" height="48" rx="7" className="bt" stroke="currentColor" strokeWidth="0" />
      <rect x="88" y="84" width="122" height="48" rx="7" fill="none" className="stroke-b" strokeWidth="2" strokeDasharray="5 4" />
      <Line x={98} y={94} w={70} h={5} c="b" />
      <Line x={98} y={106} w={100} h={4} />
      <Line x={98} y={116} w={84} h={4} />
    </Svg>
  );
}

/** Brand voice: a short form with tone chips, one selected. */
export function IlluBrandVoice({ width }) {
  return (
    <Svg width={width}>
      <circle cx="210" cy="130" r="28" className="bt" />
      <Panel x="30" y="20" w="180" h="120" />
      <Line x={46} y={36} w={60} h={5} />
      <rect x="46" y="46" width="148" height="18" rx="5" className="s ln" strokeWidth="1.5" />
      <Line x={54} y={53} w={70} h={4} c="bts" />
      <Line x={46} y={76} w={50} h={5} />
      <rect x="46" y="88" width="44" height="18" rx="9" className="b" />
      <rect x="96" y="88" width="44" height="18" rx="9" className="l" />
      <rect x="146" y="88" width="44" height="18" rx="9" className="l" />
      <Line x={54} y={95} w={28} h={4} c="s" />
      <Line x={46} y={118} w={96} h={4} />
    </Svg>
  );
}

/** Review: the store's copy beside the draft, with an approve check. */
export function IlluDrafts({ width }) {
  return (
    <Svg width={width}>
      <circle cx="30" cy="30" r="28" className="bt" />
      <Panel x="22" y="22" w="196" h="116" />
      <rect x="34" y="34" width="22" height="22" rx="5" className="l" />
      <Line x={64} y={38} w={80} h={6} />
      <Line x={64} y={50} w={46} h={5} c="bts" />
      <rect x="178" y="36" width="26" height="18" rx="5" className="ok" />
      <path d="M185 45 l4 4 l8 -8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <Line x={34} y={72} w={40} h={5} />
      <Line x={34} y={84} w={74} h={4} />
      <Line x={34} y={94} w={66} h={4} />
      <Line x={34} y={104} w={70} h={4} />
      <rect x="124" y="68" width="82" height="58" rx="6" className="bt" />
      <Line x={132} y={76} w={40} h={5} c="b" />
      <Line x={132} y={88} w={64} h={4} c="bts" />
      <Line x={132} y={98} w={58} h={4} c="bts" />
      <Line x={132} y={108} w={62} h={4} c="bts" />
    </Svg>
  );
}

/** Products: three rows with thumbnails and score rings. */
export function IlluProducts({ width }) {
  const row = (y, score) => (
    <g key={y}>
      <rect x="38" y={y} width="22" height="22" rx="5" className="l" />
      <Line x={68} y={y + 4} w={82} h={6} />
      <Line x={68} y={y + 14} w={50} h={4} c="bts" />
      <circle cx="186" cy={y + 11} r="10" fill="none" className="ln" strokeWidth="3.5" />
      <path d={`M186 ${y + 1} A10 10 0 ${score > 50 ? 1 : 0} 1 ${186 + 10 * Math.sin((score / 100) * 2 * Math.PI)} ${y + 11 - 10 * Math.cos((score / 100) * 2 * Math.PI)}`} fill="none" className={score >= 80 ? "stroke-b" : "stroke-b"} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
  return (
    <Svg width={width}>
      <circle cx="210" cy="130" r="28" className="bt" />
      <Panel x="24" y="20" w="192" h="120" />
      {row(32, 72)}
      {row(68, 45)}
      {row(104, 88)}
    </Svg>
  );
}

/** Nothing to fix: a short checklist, every line green. */
export function IlluAllGood({ width }) {
  const item = (y) => (
    <g key={y}>
      <circle cx="56" cy={y} r="9" className="ok" />
      <path d={`M51.5 ${y} l3 3 l6 -6`} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x={74} y={y - 3} w={110} h={6} />
    </g>
  );
  return (
    <Svg width={width}>
      <circle cx="200" cy="34" r="28" className="bt" />
      <Panel x="32" y="24" w="176" h="112" />
      {item(52)}
      {item(80)}
      {item(108)}
    </Svg>
  );
}

/** Scanning: a magnifier passing over product rows. */
export function IlluScan({ width }) {
  return (
    <Svg width={width}>
      <circle cx="40" cy="128" r="28" className="bt" />
      <Panel x="30" y="22" w="180" h="116" />
      <Line x={46} y={40} w={120} />
      <Line x={46} y={60} w={100} />
      <Line x={46} y={80} w={130} />
      <Line x={46} y={100} w={90} />
      <circle cx="160" cy="78" r="24" className="bt" />
      <circle cx="160" cy="78" r="24" fill="none" className="stroke-b" strokeWidth="5" />
      <path d="M177 95 l16 16" className="stroke-b" strokeWidth="7" strokeLinecap="round" />
    </Svg>
  );
}

/** A blog post: title, lines and a heading block. */
export function IlluBlog({ width }) {
  return (
    <Svg width={width}>
      <circle cx="206" cy="30" r="28" className="bt" />
      <Panel x="44" y="18" w="152" h="124" />
      <rect x="58" y="32" width="124" height="34" rx="6" className="bt" />
      <Line x={66} y={44} w={70} h={7} c="b" />
      <Line x={58} y={78} w={110} h={5} />
      <Line x={58} y={90} w={124} h={4} />
      <Line x={58} y={100} w={116} h={4} />
      <Line x={58} y={116} w={60} h={5} c="bts" />
      <Line x={58} y={128} w={100} h={4} />
    </Svg>
  );
}

/** AI shopping eligibility: a feed card with four required fields ticked. */
export function IlluFeed({ width }) {
  const f = (y, ok) => (
    <g key={y}>
      <Line x={60} y={y} w={70} h={5} />
      <circle cx="176" cy={y + 2.5} r="7" className={ok ? "ok" : "warn"} />
    </g>
  );
  return (
    <Svg width={width}>
      <circle cx="34" cy="34" r="28" className="bt" />
      <Panel x="40" y="22" w="160" h="116" />
      <Line x={56} y={36} w={56} h={7} c="b" />
      {f(60, true)}
      {f(80, true)}
      {f(100, true)}
      {f(120, false)}
    </Svg>
  );
}
