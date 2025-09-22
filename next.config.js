/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations
  output: 'standalone',
  poweredByHeader: false,
  compress: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // WebSocket サーバー用の設定と最適化
  webpack: (config, { dev, isServer }) => {
    // External dependencies
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('ws');
    }

    return config;
  },

  // Redirects for better UX
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/chat',
        permanent: true,
      }
    ];
  },
};

module.exports = nextConfig;