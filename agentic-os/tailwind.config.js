/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Everything collapses to orange + black. The semantic names (cyan,
        // magenta, lime, amber, violet) are kept so existing className strings
        // keep working — only the resolved hex values change. Each shade
        // reads as a distinct orange so semantic hierarchy is preserved.
        neon: {
          // Semantic tokens — ALL neutral whites/grays so the agent chambers
          // (War Room, Brand Foundry, Launchpad, Brain, Intel Radar) read as
          // minimal black + white. Orange is reserved for the Command Center
          // via the explicit `orange/ember/...` tokens below.
          cyan: "#f5f5f5",     // primary text/accent — near white
          magenta: "#d4d4d4",  // alt / edit — dimmer gray
          lime: "#f5f5f5",     // success — bright white
          amber: "#e5e5e5",    // warning / single-ad — soft white
          violet: "#d4d4d4",   // tertiary — dimmer gray
          // Orange tokens — ONLY used by the Command Center hub
          orange: "#ff8a00",
          ember: "#ff4d00",
          glow: "#ffb347",
          deep: "#ff6a00",
          burnt: "#e67300",
        },
        // Subtle per-agent accent colors for the Command Center cards.
        // Each one is muted/desaturated so the overall orange-on-black
        // identity stays dominant — these are decorative hints only.
        agent: {
          brain:    "#ff8a00", // orange — matches primary
          radar:    "#5fb8e0", // cool blue-teal
          war:      "#ff5c5c", // red-coral
          foundry:  "#a98bff", // violet
          launch:   "#5fd189", // mint-green
        },
        hive: {
          black: "#000000",   // deepest black for scanlines/underlays
          void: "#070504",    // app background — near-black with warm bias
          panel: "#0d0906",   // panels — slightly lifted
          grid: "#1a110a",    // grid lines / borders — warm charcoal
          edge: "#2a1b0f",    // elevated edge accents
          muted: "#8a7560",   // muted gray-brown
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        // Semantic shadows → neutral white glow
        "neon-cyan": "0 0 16px rgba(255,255,255,0.18), 0 0 40px rgba(255,255,255,0.06)",
        "neon-magenta": "0 0 16px rgba(255,255,255,0.14), 0 0 40px rgba(255,255,255,0.05)",
        "neon-lime": "0 0 16px rgba(255,255,255,0.18), 0 0 40px rgba(255,255,255,0.06)",
        // Orange shadows — reserved for Command Center
        "neon-orange": "0 0 24px rgba(255,138,0,0.6), 0 0 80px rgba(255,106,0,0.22)",
        "neon-ember": "0 0 20px rgba(255,77,0,0.5), 0 0 55px rgba(255,77,0,0.18)",
        "inner-glow": "inset 0 0 60px rgba(255,255,255,0.03)",
        "deep-cast": "0 24px 60px -24px rgba(0,0,0,0.7), 0 10px 24px -14px rgba(0,0,0,0.9)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,138,0,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,138,0,0.07) 1px, transparent 1px)",
        "radial-glow":
          "radial-gradient(circle at 50% 0%, rgba(255,138,0,0.22), transparent 55%)",
        "ember-sheen":
          "linear-gradient(135deg, rgba(255,138,0,0.08) 0%, rgba(255,77,0,0.03) 50%, rgba(0,0,0,0) 100%)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
        gridShift: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "40px 40px" },
        },
        orbit: {
          "0%": { transform: "rotateZ(0deg)" },
          "100%": { transform: "rotateZ(360deg)" },
        },
        tilt3d: {
          "0%, 100%": { transform: "rotateX(14deg) rotateY(-6deg)" },
          "50%": { transform: "rotateX(10deg) rotateY(6deg)" },
        },
      },
      animation: {
        scan: "scan 6s linear infinite",
        pulseGlow: "pulseGlow 2.5s ease-in-out infinite",
        float: "float 4s ease-in-out infinite",
        marquee: "marquee 30s linear infinite",
        flicker: "flicker 3s ease-in-out infinite",
        gridShift: "gridShift 12s linear infinite",
        orbit: "orbit 40s linear infinite",
        tilt3d: "tilt3d 10s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
