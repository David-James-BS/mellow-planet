import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "David's Kopitiam",
    short_name: "David's",
    description: "David's group drink ordering app for kopitiam runs",
    start_url: '/',
    display: 'standalone',
    background_color: '#fdf8f0',
    theme_color: '#7c2d12',
    icons: [
      {
        src: '/icon',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
