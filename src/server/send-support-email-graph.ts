import fetch from 'node-fetch';
import { captureError } from '@/lib/sentry';

const tenantId = process.env.GRAPH_TENANT_ID!;
const clientId = process.env.GRAPH_CLIENT_ID!;
const clientSecret = process.env.GRAPH_CLIENT_SECRET!;
const mailFrom = process.env.GRAPH_MAIL_FROM!;
const mailTo = process.env.GRAPH_MAIL_TO!;

// Token caching variables
let cachedToken: string | null = null;
let tokenExpiration: number | null = null;
const TOKEN_BUFFER_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

type TokenResponse = { 
  access_token?: string; 
  error_description?: string;
  expires_in?: number;
};

/**
 * Obtains a valid OAuth access token for Microsoft Graph API using client credentials, with caching and automatic refresh before expiration.
 *
 * @returns The access token string for Microsoft Graph API.
 *
 * @throws {Error} If the token request fails or the response does not contain an access token.
 */
async function getGraphToken(): Promise<string> {
  // Check if we have a valid cached token
  const now = Date.now();
  if (cachedToken && tokenExpiration && now < tokenExpiration - TOKEN_BUFFER_TIME) {
    console.log('Using cached Graph token');
    return cachedToken;
  }

  try {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    
    console.log('Requesting new Graph token from:', url);
    const res = await fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    
    const data = await res.json() as TokenResponse;
    if (!res.ok) {
      console.error('Failed to get token:', data);
      throw new Error(data?.error_description ?? 'Failed to get token');
    }
    if (!data.access_token) {
      console.error('No access token in response:', data);
      throw new Error('No access token returned');
    }

    // Update token cache
    cachedToken = data.access_token;
    // Set expiration time (default to 1 hour if not provided)
    tokenExpiration = now + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000);
    
    return data.access_token;
  } catch (error) {
    console.error('Error getting Graph token:', error);
    captureError(error, {
      location: 'support-email',
      type: 'graph-token',
    });
    throw error;
  }
}

export async function sendSupportEmail(subject: string, text: string) {
  try {
    console.log('Sending support email to:', mailTo);
    const token = await getGraphToken();
    
    const emailUrl = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(mailFrom) + '/sendMail';
    console.log('Sending email via:', emailUrl);
    
    const res = await fetch(emailUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: text,
          },
          toRecipients: [
            { emailAddress: { address: mailTo } }
          ],
        },
        saveToSentItems: 'false',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to send email:', {
        status: res.status,
        statusText: res.statusText,
        error: errorText
      });
      throw new Error(`Failed to send email: ${errorText}`);
    }
    
    console.log('Support email sent successfully');
  } catch (error) {
    console.error('Error in sendSupportEmail:', error);
    captureError(error, {
      location: 'support-email',
      type: 'send-email',
      extra: {
        subject,
        mailTo,
        mailFrom
      }
    });
    throw error;
  }
} 