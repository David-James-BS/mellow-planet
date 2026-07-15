import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#7c2d12',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 320,
          borderRadius: 112,
        }}
      >
        ☕
      </div>
    ),
    { ...size }
  )
}
