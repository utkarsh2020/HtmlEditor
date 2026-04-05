export const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Presentation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0f1a; color: #fff; }
    .slide { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .hero h1 { animation: fadeUp 0.8s ease both; }
    .hero p { animation: fadeUp 0.8s ease 0.2s both; }

    .hero { background: linear-gradient(135deg, #1a1a3e 0%, #0f0f1a 100%); }
    .hero h1 { font-size: 4rem; font-weight: 800; background: linear-gradient(90deg, #7c3aed, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 1rem; text-align: center; }
    .hero p { font-size: 1.4rem; color: #94a3b8; max-width: 600px; text-align: center; line-height: 1.7; }

    .features { background: #13131f; }
    .features h2 { font-size: 2.5rem; font-weight: 700; margin-bottom: 40px; text-align: center; }
    .card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 900px; width: 100%; }
    .card { background: #1e1e2e; border: 1px solid #2d2d44; border-radius: 16px; padding: 32px; transition: transform 0.3s, border-color 0.3s; cursor: pointer; }
    .card:hover { transform: translateY(-4px); border-color: #7c3aed; }
    .card-icon { font-size: 2.5rem; margin-bottom: 16px; }
    .card h3 { font-size: 1.2rem; font-weight: 600; margin-bottom: 8px; }
    .card p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }

    .cta { background: linear-gradient(135deg, #1a1a3e 0%, #13131f 100%); }
    .cta h2 { font-size: 3rem; font-weight: 800; margin-bottom: 20px; text-align: center; }
    .cta p { font-size: 1.2rem; color: #94a3b8; text-align: center; margin-bottom: 40px; }
    .btn { display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #7c3aed, #06b6d4); border-radius: 50px; font-size: 1.1rem; font-weight: 600; color: #fff; cursor: pointer; border: none; transition: opacity 0.2s, transform 0.2s; }
    .btn:hover { opacity: 0.9; transform: scale(1.02); }
  </style>
</head>
<body>
  <section class="slide hero" data-section="hero">
    <h1>The Future of AI</h1>
    <p>Transforming how we work, create, and solve problems with intelligent automation and machine learning.</p>
  </section>

  <section class="slide features" data-section="features">
    <h2>Core Capabilities</h2>
    <div class="card-grid">
      <div class="card">
        <div class="card-icon">🧠</div>
        <h3>Deep Learning</h3>
        <p>Neural networks that learn from billions of data points to recognize patterns and make predictions.</p>
      </div>
      <div class="card">
        <div class="card-icon">⚡</div>
        <h3>Real-time Processing</h3>
        <p>Sub-millisecond inference enabling truly real-time AI applications at scale.</p>
      </div>
      <div class="card">
        <div class="card-icon">🔒</div>
        <h3>Secure by Design</h3>
        <p>Privacy-first architecture with end-to-end encryption and on-device processing.</p>
      </div>
    </div>
  </section>

  <section class="slide cta" data-section="cta">
    <h2>Ready to Get Started?</h2>
    <p>Join thousands of teams already building with our platform.</p>
    <button class="btn">Start Free Trial</button>
  </section>
</body>
</html>`;

export const COMPONENTS = [
  {
    id: 'hero',
    label: 'Hero Section',
    icon: '🏔️',
    category: 'Layout',
    html: `<section data-section="hero-new" style="background:linear-gradient(135deg,#1a1a3e,#0f0f1a);padding:100px 60px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center">
  <h1 style="font-size:3.5rem;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:20px;line-height:1.15">Your Compelling Headline</h1>
  <p style="font-size:1.3rem;color:#94a3b8;max-width:540px;line-height:1.7;margin-bottom:40px">Add your subtitle or description here. Make it memorable and benefit-focused.</p>
  <button style="padding:16px 40px;background:linear-gradient(135deg,#7c3aed,#06b6d4);border:none;border-radius:50px;color:#fff;font-size:1.05rem;font-weight:700;cursor:pointer;transition:transform .2s,opacity .2s">Get Started Free</button>
</section>`,
  },
  {
    id: 'cards',
    label: 'Card Grid',
    icon: '🃏',
    category: 'Layout',
    html: `<section data-section="cards-new" style="background:#13131f;padding:80px 60px;display:flex;flex-direction:column;align-items:center">
  <h2 style="color:#fff;font-size:2.2rem;font-weight:700;margin-bottom:48px;text-align:center">Key Features</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:900px;width:100%">
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:16px;padding:32px">
      <div style="font-size:2.2rem;margin-bottom:16px">✨</div>
      <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Feature One</h3>
      <p style="color:#94a3b8;font-size:.9rem;line-height:1.65">Describe this feature and its key benefit to users.</p>
    </div>
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:16px;padding:32px">
      <div style="font-size:2.2rem;margin-bottom:16px">🚀</div>
      <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Feature Two</h3>
      <p style="color:#94a3b8;font-size:.9rem;line-height:1.65">Describe this feature and its key benefit to users.</p>
    </div>
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:16px;padding:32px">
      <div style="font-size:2.2rem;margin-bottom:16px">💡</div>
      <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Feature Three</h3>
      <p style="color:#94a3b8;font-size:.9rem;line-height:1.65">Describe this feature and its key benefit to users.</p>
    </div>
  </div>
</section>`,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: '📅',
    category: 'Content',
    html: `<section data-section="timeline-new" style="background:#0f0f1a;padding:80px 60px;display:flex;flex-direction:column;align-items:center">
  <h2 style="color:#fff;font-size:2.2rem;font-weight:700;margin-bottom:56px;text-align:center">Roadmap</h2>
  <div style="max-width:600px;width:100%">
    <div style="display:flex;gap:20px;margin-bottom:36px">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
        <div style="width:14px;height:14px;background:#7c3aed;border-radius:50%;margin-top:3px;box-shadow:0 0 12px #7c3aed80"></div>
        <div style="width:2px;flex:1;background:linear-gradient(#7c3aed,#2d2d44);margin-top:6px;min-height:40px"></div>
      </div>
      <div style="padding-bottom:8px">
        <div style="color:#a78bfa;font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Q1 2024</div>
        <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Launch &amp; Beta</h3>
        <p style="color:#94a3b8;font-size:.9rem;line-height:1.6">Initial launch and beta testing with early adopters and key partners.</p>
      </div>
    </div>
    <div style="display:flex;gap:20px;margin-bottom:36px">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
        <div style="width:14px;height:14px;background:#06b6d4;border-radius:50%;margin-top:3px;box-shadow:0 0 12px #06b6d480"></div>
        <div style="width:2px;flex:1;background:linear-gradient(#06b6d4,#2d2d44);margin-top:6px;min-height:40px"></div>
      </div>
      <div style="padding-bottom:8px">
        <div style="color:#67e8f9;font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Q2 2024</div>
        <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Scale Infrastructure</h3>
        <p style="color:#94a3b8;font-size:.9rem;line-height:1.6">Expand capacity and onboard enterprise clients with dedicated support.</p>
      </div>
    </div>
    <div style="display:flex;gap:20px">
      <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
        <div style="width:14px;height:14px;background:#10b981;border-radius:50%;margin-top:3px;box-shadow:0 0 12px #10b98180"></div>
      </div>
      <div>
        <div style="color:#6ee7b7;font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Q3 2024</div>
        <h3 style="color:#fff;font-size:1.1rem;margin-bottom:8px">Global Rollout</h3>
        <p style="color:#94a3b8;font-size:.9rem;line-height:1.6">Worldwide availability with multi-language support and regional data centers.</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'stats',
    label: 'Stats Bar',
    icon: '📊',
    category: 'Content',
    html: `<section data-section="stats-new" style="background:#1e1e2e;border-top:1px solid #2d2d44;border-bottom:1px solid #2d2d44;padding:56px 60px">
  <div style="display:flex;justify-content:space-around;max-width:900px;margin:0 auto;flex-wrap:wrap;gap:32px">
    <div style="text-align:center">
      <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">10M+</div>
      <div style="color:#94a3b8;margin-top:8px;font-size:.95rem">Active Users</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">99.9%</div>
      <div style="color:#94a3b8;margin-top:8px;font-size:.95rem">Uptime SLA</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">150+</div>
      <div style="color:#94a3b8;margin-top:8px;font-size:.95rem">Countries</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(90deg,#7c3aed,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">4.9★</div>
      <div style="color:#94a3b8;margin-top:8px;font-size:.95rem">User Rating</div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'two-col',
    label: 'Two Column',
    icon: '⬛',
    category: 'Layout',
    html: `<section data-section="two-col-new" style="background:#0f0f1a;padding:80px 60px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;max-width:1000px;margin:0 auto">
    <div>
      <div style="color:#a78bfa;font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px">Why Choose Us</div>
      <h2 style="color:#fff;font-size:2.2rem;font-weight:700;margin-bottom:20px;line-height:1.3">Built for teams who move fast</h2>
      <p style="color:#94a3b8;line-height:1.7;margin-bottom:24px;font-size:1rem">Add your explanation here. This layout works well for feature descriptions or any side-by-side content that needs breathing room.</p>
      <ul style="color:#94a3b8;padding-left:20px;line-height:2.2;font-size:.95rem">
        <li>Key benefit or feature one</li>
        <li>Key benefit or feature two</li>
        <li>Key benefit or feature three</li>
      </ul>
    </div>
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:20px;padding:48px;text-align:center">
      <div style="font-size:5rem;margin-bottom:20px">🎯</div>
      <p style="color:#64748b;font-size:.95rem">Replace with your visual content, chart, or image</p>
    </div>
  </div>
</section>`,
  },
  {
    id: 'cta',
    label: 'CTA Section',
    icon: '🎯',
    category: 'Layout',
    html: `<section data-section="cta-new" style="background:linear-gradient(135deg,#1a1a3e,#13131f);padding:100px 60px;display:flex;flex-direction:column;align-items:center;text-align:center">
  <h2 style="color:#fff;font-size:3rem;font-weight:800;margin-bottom:20px;line-height:1.2">Ready to Transform Your Workflow?</h2>
  <p style="color:#94a3b8;font-size:1.2rem;max-width:500px;margin-bottom:48px;line-height:1.7">Join thousands of teams already using our platform to build faster and smarter.</p>
  <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">
    <button style="padding:16px 40px;background:linear-gradient(135deg,#7c3aed,#06b6d4);border:none;border-radius:50px;color:#fff;font-size:1.05rem;font-weight:700;cursor:pointer">Start Free Trial</button>
    <button style="padding:16px 40px;background:transparent;border:1px solid #2d2d44;border-radius:50px;color:#94a3b8;font-size:1.05rem;cursor:pointer">View Demo</button>
  </div>
</section>`,
  },
  {
    id: 'pricing',
    label: 'Pricing',
    icon: '💰',
    category: 'Content',
    html: `<section data-section="pricing-new" style="background:#0f0f1a;padding:80px 60px;display:flex;flex-direction:column;align-items:center">
  <h2 style="color:#fff;font-size:2.2rem;font-weight:700;margin-bottom:12px;text-align:center">Simple Pricing</h2>
  <p style="color:#94a3b8;margin-bottom:56px;text-align:center">No hidden fees. Cancel anytime.</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:860px;width:100%">
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:20px;padding:36px;text-align:center">
      <div style="color:#94a3b8;font-size:.9rem;margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Starter</div>
      <div style="color:#fff;font-size:2.5rem;font-weight:800;margin-bottom:4px">$0</div>
      <div style="color:#475569;font-size:.85rem;margin-bottom:28px">/ month</div>
      <ul style="text-align:left;color:#94a3b8;font-size:.9rem;line-height:2.4;padding-left:16px;margin-bottom:32px">
        <li>5 projects</li><li>1GB storage</li><li>Community support</li>
      </ul>
      <button style="width:100%;padding:12px;border:1px solid #2d2d44;border-radius:10px;background:transparent;color:#94a3b8;cursor:pointer;font-size:.95rem">Get Started</button>
    </div>
    <div style="background:linear-gradient(135deg,#1e1e3e,#1a1a2e);border:1px solid #7c3aed;border-radius:20px;padding:36px;text-align:center;position:relative">
      <div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#7c3aed,#06b6d4);padding:4px 16px;border-radius:20px;font-size:.75rem;font-weight:700;color:#fff">POPULAR</div>
      <div style="color:#a78bfa;font-size:.9rem;margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Pro</div>
      <div style="color:#fff;font-size:2.5rem;font-weight:800;margin-bottom:4px">$29</div>
      <div style="color:#475569;font-size:.85rem;margin-bottom:28px">/ month</div>
      <ul style="text-align:left;color:#94a3b8;font-size:.9rem;line-height:2.4;padding-left:16px;margin-bottom:32px">
        <li>Unlimited projects</li><li>50GB storage</li><li>Priority support</li>
      </ul>
      <button style="width:100%;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;cursor:pointer;font-size:.95rem;font-weight:600">Get Started</button>
    </div>
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:20px;padding:36px;text-align:center">
      <div style="color:#94a3b8;font-size:.9rem;margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Enterprise</div>
      <div style="color:#fff;font-size:2.5rem;font-weight:800;margin-bottom:4px">$99</div>
      <div style="color:#475569;font-size:.85rem;margin-bottom:28px">/ month</div>
      <ul style="text-align:left;color:#94a3b8;font-size:.9rem;line-height:2.4;padding-left:16px;margin-bottom:32px">
        <li>Everything in Pro</li><li>SLA &amp; dedicated infra</li><li>24/7 support</li>
      </ul>
      <button style="width:100%;padding:12px;border:1px solid #2d2d44;border-radius:10px;background:transparent;color:#94a3b8;cursor:pointer;font-size:.95rem">Contact Sales</button>
    </div>
  </div>
</section>`,
  },
  {
    id: 'testimonial',
    label: 'Testimonial',
    icon: '💬',
    category: 'Content',
    html: `<section data-section="testimonials-new" style="background:#13131f;padding:80px 60px;display:flex;flex-direction:column;align-items:center">
  <h2 style="color:#fff;font-size:2.2rem;font-weight:700;margin-bottom:56px;text-align:center">What People Say</h2>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;max-width:820px;width:100%">
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:16px;padding:32px">
      <div style="color:#7c3aed;font-size:2rem;margin-bottom:16px">"</div>
      <p style="color:#e2e8f0;font-size:1rem;line-height:1.7;margin-bottom:24px">This platform completely changed how we ship products. The speed and quality are unmatched.</p>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#06b6d4);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">S</div>
        <div><div style="color:#fff;font-weight:600;font-size:.9rem">Sarah Johnson</div><div style="color:#475569;font-size:.8rem">CTO, TechCorp</div></div>
      </div>
    </div>
    <div style="background:#1e1e2e;border:1px solid #2d2d44;border-radius:16px;padding:32px">
      <div style="color:#06b6d4;font-size:2rem;margin-bottom:16px">"</div>
      <p style="color:#e2e8f0;font-size:1rem;line-height:1.7;margin-bottom:24px">The best investment we made this year. Our team productivity doubled in the first month.</p>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#06b6d4,#10b981);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">M</div>
        <div><div style="color:#fff;font-weight:600;font-size:.9rem">Mike Chen</div><div style="color:#475569;font-size:.8rem">Product Lead, StartupX</div></div>
      </div>
    </div>
  </div>
</section>`,
  },
];

export const AI_QUICK_PROMPTS = [
  { icon: '✨', label: 'Modernize design', prompt: 'Make this section more modern, clean, and visually striking with contemporary design trends' },
  { icon: '🎨', label: 'Vibrant colors', prompt: 'Make the colors more vibrant and energetic with bold gradients and accents' },
  { icon: '💎', label: 'Glassmorphism', prompt: 'Apply a glassmorphism effect with frosted glass backgrounds, blur effects, and subtle borders' },
  { icon: '🌙', label: 'Dark cyberpunk', prompt: 'Transform to a dark cyberpunk aesthetic with neon accents, grid lines, and futuristic typography' },
  { icon: '⚡', label: 'Add animations', prompt: 'Add smooth, polished CSS animations — fade-ins, slide-ups, and hover micro-interactions' },
  { icon: '📐', label: 'Minimize layout', prompt: 'Simplify the layout to be clean and minimal with generous whitespace and refined typography' },
  { icon: '🔥', label: 'Bold & dramatic', prompt: 'Make this bold and dramatic with large typography, strong contrasts, and powerful visual hierarchy' },
  { icon: '🌊', label: 'Fluid & organic', prompt: 'Apply a fluid, organic feel with curved shapes, soft shadows, and wave-like design elements' },
];

export const THEMES = [
  {
    id: 'dark-purple',
    label: 'Dark Purple',
    description: 'Deep space vibes',
    colors: { bg: '#0f0f1a', surface: '#1e1e2e', border: '#2d2d44', accent: '#7c3aed', accent2: '#06b6d4', text: '#ffffff', muted: '#94a3b8' },
  },
  {
    id: 'midnight-blue',
    label: 'Midnight Blue',
    description: 'Ocean deep',
    colors: { bg: '#030712', surface: '#111827', border: '#1f2937', accent: '#3b82f6', accent2: '#8b5cf6', text: '#f9fafb', muted: '#9ca3af' },
  },
  {
    id: 'forest',
    label: 'Forest Dark',
    description: 'Nature-inspired',
    colors: { bg: '#0a1a0f', surface: '#132417', border: '#1e3a2a', accent: '#10b981', accent2: '#34d399', text: '#f0fdf4', muted: '#6ee7b7' },
  },
  {
    id: 'light-clean',
    label: 'Clean Light',
    description: 'Minimal & bright',
    colors: { bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0', accent: '#6366f1', accent2: '#8b5cf6', text: '#0f172a', muted: '#64748b' },
  },
  {
    id: 'warm-amber',
    label: 'Warm Amber',
    description: 'Cozy & warm',
    colors: { bg: '#1c1208', surface: '#27180a', border: '#3d2b10', accent: '#f59e0b', accent2: '#f97316', text: '#fffbeb', muted: '#d97706' },
  },
  {
    id: 'rose-gold',
    label: 'Rose Gold',
    description: 'Luxe & elegant',
    colors: { bg: '#1a0f14', surface: '#2d1520', border: '#4a2535', accent: '#f43f5e', accent2: '#fb923c', text: '#fff1f2', muted: '#fda4af' },
  },
];
