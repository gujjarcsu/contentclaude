export function ContentClaudeLogo({ size = "medium" }) {
  const dim = { small: 24, medium: 40, large: 64 }[size] ?? 40;
  return (
    <img
      src="/logos/contentclaude-icon-square.svg"
      alt="Navaal"
      width={dim}
      height={dim}
      style={{ display: "block", aspectRatio: "1" }}
    />
  );
}

export function ContentClaudeBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <ContentClaudeLogo size="medium" />
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
          Nav<span style={{ color: "#0A84FF" }}>aal</span>
        </div>
        <div style={{ fontSize: 12, color: "#666666", marginTop: 2 }}>
          Powered by premium AI
        </div>
      </div>
    </div>
  );
}
