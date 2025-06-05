import fetch from 'node-fetch';

const tenantId = process.env.GRAPH_TENANT_ID!;
const clientId = process.env.GRAPH_CLIENT_ID!;
const clientSecret = process.env.GRAPH_CLIENT_SECRET!;
const mailFrom = process.env.GRAPH_MAIL_FROM!;
const mailTo = process.env.GRAPH_MAIL_TO!;

type TokenResponse = { access_token?: string; error_description?: string };

async function getGraphToken(): Promise<string> {
  try {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    
    console.log('Requesting Graph token from:', url);
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
    return data.access_token;
  } catch (error) {
    console.error('Error getting Graph token:', error);
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
    throw error;
  }
} 