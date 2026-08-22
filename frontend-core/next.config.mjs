/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 otherwise writes AGENTS.md / CLAUDE.md into the project root.
  agentRules: false,

  async redirects() {
    return [
      // `permanent: false` on purpose — a 308 is cached by browsers
      // indefinitely, which would be painful if `/` ever becomes a landing page.
      { source: '/', destination: '/products', permanent: false },
    ]
  },
}

export default nextConfig
