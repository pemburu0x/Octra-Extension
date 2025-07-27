// ONS (Octra Name Service) utilities
export interface ONSResolution {
  domain: string;
  address: string;
  verified: boolean;
  status: string;
  created_at: string;
}

export interface ONSError {
  error: string;
}

// Default ONS resolver URL - can be configured
const ONS_RESOLVER_URL = import.meta.env.VITE_ONS_RESOLVER_URL || 'http://localhost:3001';

export function isONSDomain(input: string): boolean {
  // Check if it's a valid ONS domain format: alphanumeric + dots, ending with .oct
  const onsRegex = /^[a-zA-Z0-9.-]+\.oct$/;
  return onsRegex.test(input);
}

export function isOctraAddress(input: string): boolean {
  // Check if it's a valid Octra address: exactly 47 characters starting with "oct"
  const addressRegex = /^oct[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44}$/;
  return addressRegex.test(input);
}

export function validateRecipientInput(input: string): { isValid: boolean; type: 'address' | 'ons' | 'invalid'; error?: string } {
  if (!input || input.trim().length === 0) {
    return { isValid: false, type: 'invalid', error: 'Input is required' };
  }

  const trimmedInput = input.trim();

  // Check if it's a valid Octra address
  if (isOctraAddress(trimmedInput)) {
    return { isValid: true, type: 'address' };
  }

  // Check if it's a valid ONS domain
  if (isONSDomain(trimmedInput)) {
    return { isValid: true, type: 'ons' };
  }

  return { 
    isValid: false, 
    type: 'invalid', 
    error: 'Invalid address format. Must be exactly 47 characters starting with "oct" or ONS domain ending with ".oct"'
  };
}

export async function resolveONSDomain(domain: string): Promise<string | null> {
  try {
    // Remove .oct suffix for API call if present
    const cleanDomain = domain.endsWith('.oct') ? domain.slice(0, -4) : domain;
    
    const response = await fetch(`${ONS_RESOLVER_URL}/api/domains/resolve/${cleanDomain}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Domain not found
      }
      throw new Error(`ONS resolution failed: ${response.status}`);
    }

    const data: ONSResolution = await response.json();
    
    // Verify the domain is active and verified
    if (data.verified && data.status === 'active') {
      return data.address;
    }

    return null;
  } catch (error) {
    console.error('Error resolving ONS domain:', error);
    return null;
  }
}

export async function resolveRecipientAddress(input: string): Promise<{ address: string | null; type: 'address' | 'ons'; error?: string }> {
  const validation = validateRecipientInput(input);
  
  if (!validation.isValid) {
    return { address: null, type: 'invalid' as any, error: validation.error };
  }

  if (validation.type === 'address') {
    return { address: input.trim(), type: 'address' };
  }

  if (validation.type === 'ons') {
    try {
      const resolvedAddress = await resolveONSDomain(input.trim());
      if (resolvedAddress) {
        return { address: resolvedAddress, type: 'ons' };
      } else {
        return { address: null, type: 'ons', error: 'ONS domain not found or not verified' };
      }
    } catch (error) {
      return { address: null, type: 'ons', error: 'Failed to resolve ONS domain' };
    }
  }

  return { address: null, type: 'invalid' as any, error: 'Unknown validation error' };
}