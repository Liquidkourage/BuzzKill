import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const identity = searchParams.get('identity');

    if (!code || !identity) {
      return NextResponse.json({ error: 'Missing code or identity' }, { status: 400 });
    }

    // Check if LiveKit is configured
    if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      // Return mock token for development
      return NextResponse.json({
        token: 'mock-token-' + Math.random().toString(36).substring(2),
        url: 'ws://localhost:7880'
      });
    }

    // Generate real LiveKit token
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: identity,
      ttl: '1h'
    });

    token.addGrant({
      room: code,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return NextResponse.json({
      token: await token.toJwt(),
      url: process.env.LIVEKIT_URL
    });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
