import { NextResponse } from 'next/server';
import { createSafeTimeoutSignal } from '@/utils/environmentUtils';
import { getPythonApiUrl } from '@/config/serverBackend';

function formatModelInfoFallbackReason(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

/**
 * API route to get information about available models
 * This provides fallback model information when the Python backend is not available
 */
export async function GET() {
  try {
    // Try to call the Python backend API first with timeout
    const backendUrl = getPythonApiUrl();
    try {
      const response = await fetch(`${backendUrl}/api/model-info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging (increased for cold starts)
        signal: createSafeTimeoutSignal(15000) // 15 second timeout for cold starts
      });

      if (response.ok) {
        const data = await response.json();
        // Return the response with cache headers for better performance
        return new NextResponse(JSON.stringify(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
          },
        });
      }
    } catch (error) {
      console.info(`Backend model-info not available, using fallback (${formatModelInfoFallbackReason(error)})`);
    }

    // Fallback model information when the backend is not available
    const fallbackModelInfo = {
      success: true,
      models: {
        beat: [
          {
            id: 'beat-this',
            name: 'Beat This!',
            description: 'Transformer beat and downbeat tracker (ISMIR 2024), no source separation',
            default: true
          },
          {
            id: 'madmom',
            name: 'Madmom',
            description: 'Neural network with high accuracy and speed, best for common time signatures (3/4, 4/4)',
            default: false
          },

          {
            id: 'beat-transformer',
            name: 'Beat-Transformer',
            description: 'DL model with 5-channel audio separation, flexible in time signatures, slow processing speed',
            default: false
          }
        ],
        chord: [
          {
            id: 'btc-cl',
            name: 'BTC CL (Continual Learning)',
            description: 'BTC trained with pseudo-labels then continual learning (arXiv 2602.19778)',
            default: true
          },
          {
            id: 'btc-sl',
            name: 'BTC (original)',
            description: 'Original BTC transformer (ISMIR 2019)',
            default: false
          },
          {
            id: 'chord-cnn-lstm',
            name: 'Chord-CNN-LSTM',
            description: 'Deep learning model for chord recognition',
            default: false
          }
        ]
      }
    };

    // Return the fallback response with cache headers
    return new NextResponse(JSON.stringify(fallbackModelInfo), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error in model-info API route:', error);
    return NextResponse.json(
      {
        success: true,
        models: {
          beat: [
            {
              id: 'beat-this',
              name: 'Beat This!',
              description: 'Transformer beat and downbeat tracker (ISMIR 2024), no source separation',
              default: true
            }
          ],
          chord: [
            {
              id: 'btc-cl',
              name: 'BTC CL (Continual Learning)',
              description: 'BTC trained with pseudo-labels then continual learning (arXiv 2602.19778)',
              default: true
            },
            {
              id: 'btc-sl',
              name: 'BTC (original)',
              description: 'Original BTC transformer (ISMIR 2019)',
              default: false
            }
          ]
        }
      }
    );
  }
}
